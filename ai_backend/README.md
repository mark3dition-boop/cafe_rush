# Cafe AI Workflow

AI-powered table management dan upselling assistant untuk kafe, menggunakan LangGraph + RAG.

## Struktur Folder

```
cafe-ai-workflow/
├── knowledge_base/      # Dokumen SOP & menu untuk RAG
│   ├── cafe_policy.txt  # Kebijakan batas waktu duduk
│   ├── menu_upsell.txt  # Strategi upsell & daftar menu
│   └── staff_sop.txt    # Panduan prosedur staff
│
├── rag/                 # Setup ChromaDB & RAG pipeline
│   └── setup_rag.py
│
├── tools/               # Tool functions untuk LangGraph agent
│   └── table_tools.py
│
├── agent/               # LangGraph workflow graph
│   └── workflow.py
│
├── mock/                # Mock data dari CV pipeline
│   └── cv_mock.py
│
├── main.py              # Entry point untuk test
└── .env                 # API keys
```

## Setup

```bash
pip install langgraph langchain langchain-community langchain-openai chromadb
```

Isi `.env`:
```
GROQ_API_KEY=your_key_here
```

## Cara Jalankan

```bash
python main.py
```
