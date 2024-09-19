# Beauty AI Assistant

![License](https://img.shields.io/github/license/sithukaungset/RAG-hack-agent)
![GitHub repo size](https://img.shields.io/github/repo-size/sithukaungset/RAG-hack-agent)
![GitHub stars](https://img.shields.io/github/stars/sithukaungset/RAG-hack-agent?style=social)
![GitHub forks](https://img.shields.io/github/forks/sithukaungset/RAG-hack-agent?style=social)

## Table of Contents

- [Project Name](#project-name)
- [Description](#description)
- [Features](#features)
- [Technology & Languages](#technology--languages)
- [Demo](#demo)
  - [Project Repository](#project-repository)
  - [Deployed Endpoint](#deployed-endpoint)
  - [Project Video](#project-video)
- [Team Members](#team-members)
- [License](#license)

## Project Name

**Beauty AI Assistant**

## Description

An innovative **AI Beauty Assistant** that merges cutting-edge technology with beauty expertise. By integrating the best-selling beauty and skincare products data from Olive Young Korea, complete with product images, I utilized semantic chunking via Azure Document Intelligence to enhance data ingestion. This process breaks down product information into meaningful sections for better insights. The data is then vectorized using Azure AI Search, ensuring highly relevant data retrieval. Customer data is securely stored in Azure SQL, enabling personalized recommendations and tailored skincare advice.

At the heart of this system is a multi-agent architecture, consisting of:

- **Trend Research Agent:** Leverages Bing Search to stay updated with the latest skincare trends and products.
- **Product Retriever Agent:** Utilizes Azure AI Search's hybrid search and semantic re-ranking to fetch the most relevant product data from our vector storage.
- **Skincare Routine Creator Agent:** Synthesizes data from other agents to craft personalized skincare routines based on real-time trends and top product recommendations.

This system is deployed using **Promptflow** and **Prompty** as the orchestration engine, ensuring seamless interactions between agents in Azure AI Studio. With this setup, thousands of beauty enthusiasts can enjoy tailored beauty advice, discover the hottest products, and receive expertly crafted skincare routines—all powered by intelligent agents and Large Language Models (LLMs).

The solution integrates an **Azure Speech-powered Avatar** to deliver an interactive experience, guiding users through product queries and skincare routines for a more intuitive and human-like interface. Additionally, the assistant supports multilingual interactions, automatically detecting the user’s language and responding in either English or Korean, ensuring a seamless experience for a diverse audience.

This dynamic, agentic system offers users the ultimate beauty companion, delivering personalized and data-driven skincare guidance.

## Features

- **Personalized Recommendations:** Tailored skincare advice based on individual customer data.
- **Real-Time Trend Analysis:** Stay updated with the latest skincare trends and products.
- **Multilingual Support:** Interacts in English and Korean for a diverse user base.
- **Interactive Avatar:** Azure Speech-powered avatar for a human-like interface.
- **Secure Data Storage:** Customer data securely stored in Azure SQL.
- **Seamless Deployment:** Orchestrated using Promptflow and Prompty in Azure AI Studio.

## Technology & Languages

- **Programming Languages:**
  - Python
- **Technologies:**
  - Azure AI Studio
  - Azure AI Search
  - Azure Document Intelligence
  - Azure SQL

## Demo

### Project Repository

Access the project repository on GitHub: [RAG-hack-agent](https://github.com/sithukaungset/RAG-hack-agent)

### Deployed Endpoint

Experience the deployed application: [Beauty AI Assistant](https://red-pebble-0c942770f.5.azurestaticapps.net/)

### Project Video

Watch the project overview video: [YouTube Video](https://www.youtube.com/watch?v=v6ARi5JzJNU)

## Team Members

- **sithukaungset**

## License

This project is licensed under the [MIT License](LICENSE).
