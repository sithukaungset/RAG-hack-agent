// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license.

var system_prompt = `You are an AI assistant focused on delivering brief product details and assisting with the ordering process.
- Before calling a function, aim to answer product queries using existing conversational context.
- If the product information isn't clear or available, consult get_product_information for accurate details. Never invent answers.  
- Address customer account or order-related queries with the appropriate functions.
- Before seeking account specifics (like account_id), scan previous parts of the conversation. Reuse information if available, avoiding repetitive queries.
- NEVER GUESS FUNCTION INPUTS! If a user's request is unclear, request further clarification. 
- Provide responses within 3 sentences, emphasizing conciseness and accuracy.
- If not specified otherwise, the account_id of the current user is 1000
- Pay attention to the language the customer is using in their latest statement and respond in the same language!
`

const TTSVoice = "en-US-JennyMultilingualNeural" // Update this value if you want to use a different voice

const CogSvcRegion = "westeurope" // Fill your Azure cognitive services region here, e.g. westus2

const IceServerUrl = "turn:relay.communication.microsoft.com:3478" // Fill your ICE server URL here, e.g. turn:turn.azure.com:3478
let IceServerUsername
let IceServerCredential

const TalkingAvatarCharacter = "lisa"
const TalkingAvatarStyle = "casual-sitting"

supported_languages = ["en-US", "ko-KR"] // The language detection engine supports a maximum of 4 languages

let token

const speechSynthesisConfig = SpeechSDK.SpeechConfig.fromEndpoint(new URL("wss://{region}.tts.speech.microsoft.com/cognitiveservices/websocket/v1?enableTalkingAvatar=true".replace("{region}", CogSvcRegion)))

// Global objects
var speechSynthesizer
var avatarSynthesizer
var peerConnection
var previousAnimationFrameTimestamp = 0

messages = [{ "role": "system", "content": system_prompt }];

function removeDocumentReferences(str) {
  // Regular expression to match [docX]
  var regex = /\[doc\d+\]/g;

  // Replace document references with an empty string
  var result = str.replace(regex, '');

  return result;
}

// Setup WebRTC
function setupWebRTC() {
  // Create WebRTC peer connection
  fetch("/api/getIceServerToken", {
    method: "POST"
  })
    .then(async res => {
      const reponseJson = await res.json()
      peerConnection = new RTCPeerConnection({
        iceServers: [{
          urls: reponseJson["Urls"],
          username: reponseJson["Username"],
          credential: reponseJson["Password"]
        }]
      })

      // Fetch WebRTC video stream and mount it to an HTML video element
      peerConnection.ontrack = function (event) {
        console.log('peerconnection.ontrack', event)
        // Clean up existing video element if there is any
        remoteVideoDiv = document.getElementById('remoteVideo')
        for (var i = 0; i < remoteVideoDiv.childNodes.length; i++) {
          if (remoteVideoDiv.childNodes[i].localName === event.track.kind) {
            remoteVideoDiv.removeChild(remoteVideoDiv.childNodes[i])
          }
        }

        const videoElement = document.createElement(event.track.kind)
        videoElement.id = event.track.kind
        videoElement.srcObject = event.streams[0]
        videoElement.autoplay = true
        videoElement.controls = false
        document.getElementById('remoteVideo').appendChild(videoElement)

        canvas = document.getElementById('canvas')
        remoteVideoDiv.hidden = true
        canvas.hidden = false

        videoElement.addEventListener('play', () => {
          remoteVideoDiv.style.width = videoElement.videoWidth / 2 + 'px'
          window.requestAnimationFrame(makeBackgroundTransparent)
        })
      }

      // Make necessary update to the web page when the connection state changes
      peerConnection.oniceconnectionstatechange = e => {
        console.log("WebRTC status: " + peerConnection.iceConnectionState)

        if (peerConnection.iceConnectionState === 'connected') {
          document.getElementById('loginOverlay').classList.add("hidden");
        }

        if (peerConnection.iceConnectionState === 'disconnected') {
        }
      }

      // Offer to receive 1 audio, and 1 video track
      peerConnection.addTransceiver('video', { direction: 'sendrecv' })
      peerConnection.addTransceiver('audio', { direction: 'sendrecv' })

      // start avatar, establish WebRTC connection
      avatarSynthesizer.startAvatarAsync(peerConnection).then((r) => {
        if (r.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          console.log("[" + (new Date()).toISOString() + "] Avatar started. Result ID: " + r.resultId)
          greeting()
        } else {
          console.log("[" + (new Date()).toISOString() + "] Unable to start avatar. Result ID: " + r.resultId)
          if (r.reason === SpeechSDK.ResultReason.Canceled) {
            let cancellationDetails = SpeechSDK.CancellationDetails.fromResult(r)
            if (cancellationDetails.reason === SpeechSDK.CancellationReason.Error) {
              console.log(cancellationDetails.errorDetails)
            };

            console.log("Unable to start avatar: " + cancellationDetails.errorDetails);
          }
        }
      }).catch(
        (error) => {
          console.log("[" + (new Date()).toISOString() + "] Avatar failed to start. Error: " + error)
          document.getElementById('startSession').disabled = false
          document.getElementById('configuration').hidden = false
        }
      )

    })
}

async function generateText(prompt) {

  messages.push({
    role: 'user',
    content: prompt
  });

  let generatedText
  let products
  await fetch(`/api/message`, { method: 'POST', headers: { 'Content-Type': 'application/json'}, body: JSON.stringify(messages) })
  .then(response => response.json())
  .then(data => {
    generatedText = data["messages"][data["messages"].length - 1].content;
    messages = data["messages"];
    products = data["products"]
  });

  addToConversationHistory(generatedText, 'light');
  if(products.length > 0) {
    addProductToChatHistory(products[0]);
  }
  return generatedText;
}

// Connect to TTS Avatar API
function connectToAvatarService() {
  // Construct TTS Avatar service request
  let videoCropTopLeftX = 600
  let videoCropBottomRightX = 1320
  let backgroundColor = '#00FF00FF'

  const videoFormat = new SpeechSDK.AvatarVideoFormat()
  videoFormat.setCropRange(new SpeechSDK.Coordinate(videoCropTopLeftX, 0), new SpeechSDK.Coordinate(videoCropBottomRightX, 1080));

  const avatarConfig = new SpeechSDK.AvatarConfig(TalkingAvatarCharacter, TalkingAvatarStyle, videoFormat)
  avatarConfig.backgroundColor = backgroundColor

  avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechSynthesisConfig, avatarConfig)
  avatarSynthesizer.avatarEventReceived = function (s, e) {
      var offsetMessage = ", offset from session start: " + e.offset / 10000 + "ms."
      if (e.offset === 0) {
          offsetMessage = ""
      }
      console.log("Event received: " + e.description + offsetMessage)
  }

}

window.startSession = () => {
  var iconElement = document.createElement("i");
  iconElement.className = "fa fa-spinner fa-spin";
  iconElement.id = "loadingIcon"
  var parentElement = document.getElementById("playVideo");
  parentElement.prepend(iconElement);

  speechSynthesisConfig.speechSynthesisVoiceName = TTSVoice
  document.getElementById('playVideo').className = "round-button-hide"


  fetch("/api/getSpeechToken", {
    method: "POST"
  })
    .then(response => response.text())
    .then(response => {
      speechSynthesisConfig.authorizationToken = response;
      token = response
    })
    .then(() => {
      speechSynthesizer = new SpeechSDK.SpeechSynthesizer(speechSynthesisConfig, null)
      connectToAvatarService()
      setupWebRTC()
    })
}

async function greeting() {
  addToConversationHistory("Hello, I’m Lisa, your Beauty AI Assistant. How may I assist you today?", "light");

  let spokenText = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
                     <voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyMultilingualNeural'>
                       Hello, I’m Lisa, your Beauty AI Assistant. How may I assist you today?
                     </voice>
                   </speak>`;
  
  avatarSynthesizer.speakSsmlAsync(spokenText, (result) => {
    if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
      console.log("Speech synthesized to speaker for text [ " + spokenText + " ]. Result ID: " + result.resultId);
    } else {
      console.log("Unable to speak text. Result ID: " + result.resultId);
      if (result.reason === SpeechSDK.ResultReason.Canceled) {
        let cancellationDetails = SpeechSDK.CancellationDetails.fromResult(result);
        console.log(cancellationDetails.reason);
        if (cancellationDetails.reason === SpeechSDK.CancellationReason.Error) {
          console.log(cancellationDetails.errorDetails);
        }
      }
    }
  });
}

window.speak = (text) => {
  async function speak(text) {
    addToConversationHistory(text, 'dark');

    // Check if the user wants to generate a skincare routine
    if (text.toLowerCase().includes('Create the skincare routine')) {
      // Prompt the user for additional information
      const research = prompt('Enter skin type:');
      const products = prompt('Enter products:');
      const assignment = prompt('Enter specific skincare:');

      try {
        const articleResults = await generateArticle(research, products, assignment);
        displayArticle(articleResults);
      } catch (error) {
        console.error('Error generating article:', error);
      }
    } else {
      // Existing logic for handling other inputs
      fetch(`/api/detectLanguage?text=${encodeURIComponent(text)}`, {
        method: 'POST',
      })
        .then(response => response.text())
        .then(async language => {
          console.log(`Detected language: ${language}`);

          const generatedResult = await generateText(text);

          let spokenTextssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
            <voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyMultilingualNeural'>
              <lang xml:lang="${language}">${generatedResult}</lang>
            </voice>
          </speak>`;

          if (language == 'ar-AE') {
            spokenTextssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
              <voice xml:lang='en-US' xml:gender='Female' name='ar-AE-FatimaNeural'>
                <lang xml:lang="${language}">${generatedResult}</lang>
              </voice>
            </speak>`;
          }

          avatarSynthesizer.speakSsmlAsync(spokenTextssml, (result) => {
            if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
              console.log(`Speech synthesized for text [${generatedResult}]. Result ID: ${result.resultId}`);
            } else {
              console.error(`Unable to speak text. Result ID: ${result.resultId}`);
            }
          });
        })
        .catch(error => {
          console.error('Error:', error);
        });
    }
  }
  speak(text);
};

// window.speak = (text) => {
//   async function speak(text) {
//     addToConversationHistory(text, 'dark')

//     fetch("/api/detectLanguage?text="+text, {
//       method: "POST"
//     })
//       .then(response => response.text())
//       .then(async language => {
//         console.log(`Detected language: ${language}`);

//         const generatedResult = await generateText(text);
        
//         let spokenTextssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyMultilingualNeural'><lang xml:lang="${language}">${generatedResult}</lang></voice></speak>`

//         if (language == 'ar-AE') {
//           spokenTextssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice xml:lang='en-US' xml:gender='Female' name='ar-AE-FatimaNeural'><lang xml:lang="${language}">${generatedResult}</lang></voice></speak>`
//         }
//         let spokenText = generatedResult
//         avatarSynthesizer.speakSsmlAsync(spokenTextssml, (result) => {
//           if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
//             console.log("Speech synthesized to speaker for text [ " + spokenText + " ]. Result ID: " + result.resultId)
//           } else {
//             console.log("Unable to speak text. Result ID: " + result.resultId)
//             if (result.reason === SpeechSDK.ResultReason.Canceled) {
//               let cancellationDetails = SpeechSDK.CancellationDetails.fromResult(result)
//               console.log(cancellationDetails.reason)
//               if (cancellationDetails.reason === SpeechSDK.CancellationReason.Error) {
//                 console.log(cancellationDetails.errorDetails)
//               }
//             }
//           }
//         })
//       })
//       .catch(error => {
//         console.error('Error:', error);
//       });
//   }
//   speak(text);
// }

window.stopSession = () => {
  speechSynthesizer.close()
}

window.startRecording = () => {
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, 'westeurope');
  speechConfig.authorizationToken = token;
  speechConfig.SpeechServiceConnection_LanguageIdMode = "Continuous";
  var autoDetectSourceLanguageConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(supported_languages);
  // var autoDetectSourceLanguageConfig = SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(["en-US"]);

  document.getElementById('buttonIcon').className = "fas fa-stop"
  document.getElementById('startRecording').disabled = true

  recognizer = SpeechSDK.SpeechRecognizer.FromConfig(speechConfig, autoDetectSourceLanguageConfig);

  recognizer.recognized = function (s, e) {
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      console.log('Recognized:', e.result.text);
      window.stopRecording();
      // TODO: append to conversation
      window.speak(e.result.text);
    }
  };

  recognizer.startContinuousRecognitionAsync();

  console.log('Recording started.');
}

window.stopRecording = () => {
  if (recognizer) {
    recognizer.stopContinuousRecognitionAsync(
      function () {
        recognizer.close();
        recognizer = undefined;
        document.getElementById('buttonIcon').className = "fas fa-microphone"
        document.getElementById('startRecording').disabled = false
        console.log('Recording stopped.');
      },
      function (err) {
        console.error('Error stopping recording:', err);
      }
    );
  }
}

window.submitText = () => {
  document.getElementById('spokenText').textContent = document.getElementById('textinput').currentValue
  document.getElementById('textinput').currentValue = ""
  window.speak(document.getElementById('textinput').currentValue);
}


function addToConversationHistory(item, historytype) {
  const list = document.getElementById('chathistory');
  const newItem = document.createElement('li');
  newItem.classList.add('message');
  newItem.classList.add(`message--${historytype}`);
  newItem.textContent = item;
  list.appendChild(newItem);
}

function addProductToChatHistory(product) {
  const list = document.getElementById('chathistory');
  const listItem = document.createElement('li');
  listItem.classList.add('product');
  listItem.innerHTML = `
    <fluent-card class="product-card">
      <div class="product-card__header">
        <img src="${product.image_url}" alt="tent" width="100%">
      </div>
      <div class="product-card__content">
        <div><span class="product-card__price">$${product.special_offer}</span> <span class="product-card__old-price">$${product.original_price}</span></div>
        <div>${product.tagline}</div>
      </div>
    </fluent-card>
  `;
  list.appendChild(listItem);
}

// Make video background transparent by matting
function makeBackgroundTransparent(timestamp) {
  // Throttle the frame rate to 30 FPS to reduce CPU usage
  if (timestamp - previousAnimationFrameTimestamp > 30) {
      video = document.getElementById('video')
      tmpCanvas = document.getElementById('tmpCanvas')
      tmpCanvasContext = tmpCanvas.getContext('2d', { willReadFrequently: true })
      tmpCanvasContext.drawImage(video, 0, 0, video.videoWidth, video.videoHeight)
      if (video.videoWidth > 0) {
          let frame = tmpCanvasContext.getImageData(0, 0, video.videoWidth, video.videoHeight)
          for (let i = 0; i < frame.data.length / 4; i++) {
              let r = frame.data[i * 4 + 0]
              let g = frame.data[i * 4 + 1]
              let b = frame.data[i * 4 + 2]
              
              if (g - 150 > r + b) {
                  // Set alpha to 0 for pixels that are close to green
                  frame.data[i * 4 + 3] = 0
              } else if (g + g > r + b) {
                  // Reduce green part of the green pixels to avoid green edge issue
                  adjustment = (g - (r + b) / 2) / 3
                  r += adjustment
                  g -= adjustment * 2
                  b += adjustment
                  frame.data[i * 4 + 0] = r
                  frame.data[i * 4 + 1] = g
                  frame.data[i * 4 + 2] = b
                  // Reduce alpha part for green pixels to make the edge smoother
                  a = Math.max(0, 255 - adjustment * 4)
                  frame.data[i * 4 + 3] = a
              }
          }

          canvas = document.getElementById('canvas')
          canvasContext = canvas.getContext('2d')
          canvasContext.putImageData(frame, 0, 0);
      }

      previousAnimationFrameTimestamp = timestamp
  }

  window.requestAnimationFrame(makeBackgroundTransparent)
}

async function generateArticle(research, products, assignment) {
  try {
    const response = await fetch('https://hackathon-rag-yzkw-api.graywave-14fe07de.eastus2.azurecontainerapps.io/api/article', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        research: research,
        products: products,
        assignment: assignment,
        evaluate: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let done = false;
    let articleContent = '';

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        // Process each chunk
        articleContent += processChunk(chunk);
        // Optionally update the UI in real-time
        displayArticle(articleContent);
      }
    }
    
    // After displaying the article, have the avatar read it aloud
    speakArticle(articleContent);
    
    return articleContent;
    
  } catch (error) {
    console.error('Error generating article:', error);
    document.getElementById('articleContainer').innerHTML = `<p>Error generating article. Please try again later.</p>`;
    // Handle errors appropriately
  }
}

function processChunk(chunk) {
  let articleText = '';
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.trim()) {
      try {
        const data = JSON.parse(line);
        if (data.type === 'partial' && data.data.text) {
          articleText += data.data.text;
        }
      } catch (err) {
        console.error('Error parsing JSON:', err);
      }
    }
  }

  return articleText;
}


function displayArticle(articleContent) {
  const articleContainer = document.getElementById('articleContainer');
  if (articleContainer) {
    // articleContainer.innerHTML = `<h2>Generated Skincare Routine</h2><p>${articleContent}</p>`;
    articleContainer.innerHTML = `<h2 style="color: white;">Generated Skincare Routine</h2><p style="color: white;">${articleContent}</p>`;
  } else {
    console.error('Article container not found');
  }
}

function speakArticle(articleContent) {
  // Create SSML for the avatar to read the article
  let spokenTextssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
                          <voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyMultilingualNeural'>
                            ${articleContent}
                          </voice>
                        </speak>`;

  // Use the avatarSynthesizer to speak the SSML content
  avatarSynthesizer.speakSsmlAsync(spokenTextssml, (result) => {
    if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
      console.log('Speech synthesized for the article.');
    } else {
      console.error(`Error synthesizing speech for article. Result ID: ${result.resultId}`);
    }
  });
}

// New function to handle the text input submission
function submitUserText() {
  const userInput = document.getElementById('userInput').value;
  if (userInput) {
    window.speak(userInput);
    document.getElementById('userInput').value = '';  // Clear input after submission
  } else {
    console.error("Input is empty. Please enter a query.");
  }
}

// Function to append the user's input to conversation history and send it to the backend for processing
window.speak = (text) => {
  async function speak(text) {
    addToConversationHistory(text, 'dark');

    // Check if the user wants to generate an article
    if (text.toLowerCase().includes('generate an article')) {
      // Prompt the user for additional information
      const research = prompt('Enter research context:');
      const products = prompt('Enter products context:');
      const assignment = prompt('Enter assignment context:');

      try {
        const articleResults = await generateArticle(research, products, assignment);
        displayArticle(articleResults);
      } catch (error) {
        console.error('Error generating article:', error);
      }
    } else {
      // Existing logic for handling other inputs
      fetch(`/api/detectLanguage?text=${encodeURIComponent(text)}`, {
        method: 'POST',
      })
        .then(response => response.text())
        .then(async language => {
          console.log(`Detected language: ${language}`);

          const generatedResult = await generateText(text);

          let spokenTextssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
            <voice xml:lang='en-US' xml:gender='Female' name='en-US-JennyMultilingualNeural'>
              <lang xml:lang="${language}">${generatedResult}</lang>
            </voice>
          </speak>`;

          if (language == 'ar-AE') {
            spokenTextssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
              <voice xml:lang='en-US' xml:gender='Female' name='ar-AE-FatimaNeural'>
                <lang xml:lang="${language}">${generatedResult}</lang>
              </voice>
            </speak>`;
          }

          avatarSynthesizer.speakSsmlAsync(spokenTextssml, (result) => {
            if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
              console.log(`Speech synthesized for text [${generatedResult}]. Result ID: ${result.resultId}`);
            } else {
              console.error(`Unable to speak text. Result ID: ${result.resultId}`);
            }
          });
        })
        .catch(error => {
          console.error('Error:', error);
        });
    }
  }
  speak(text);
}
