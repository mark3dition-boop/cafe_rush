"""
Step 3: RAG Setup
Load semua file .txt dari knowledge_base ke ChromaDB sebagai vector store.
"""

import os
from pathlib import Path

from chromadb import PersistentClient
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader
from langchain_chroma import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

# ── Config ────────────────────────────────────────────────────────────────────
KNOWLEDGE_BASE_DIR = Path(__file__).parent.parent / "knowledge_base"
CHROMA_DB_DIR      = Path(__file__).parent / "chroma_db"
COLLECTION_NAME    = "cafe_knowledge"

# ── Load & split dokumen ──────────────────────────────────────────────────────
def load_documents():
    docs = []
    for txt_file in KNOWLEDGE_BASE_DIR.glob("*.txt"):
        loader = TextLoader(str(txt_file), encoding="utf-8")
        docs.extend(loader.load())
        print(f"Loaded: {txt_file.name}")
    return docs


def split_documents(docs):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=300,      # karakter per chunk
        chunk_overlap=50,    # overlap antar chunk agar konteks tidak putus
    )
    return splitter.split_documents(docs)


# ── Embedding & simpan ke ChromaDB ────────────────────────────────────────────
def build_vectorstore(chunks):
    # Pakai HuggingFace embedding (gratis, tidak butuh API key)
    embedding_model = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        # Model ini support Bahasa Indonesia
    )

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embedding_model,
        persist_directory=str(CHROMA_DB_DIR),
        collection_name=COLLECTION_NAME,
    )

    print(f"\nVectorstore berhasil dibuat di: {CHROMA_DB_DIR}")
    print(f"Total chunks tersimpan: {len(chunks)}")
    return vectorstore


# ── Load vectorstore yang sudah ada ──────────────────────────────────────────
def load_vectorstore():
    embedding_model = HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    )
    vectorstore = Chroma(
        persist_directory=str(CHROMA_DB_DIR),
        embedding_function=embedding_model,
        collection_name=COLLECTION_NAME,
    )
    return vectorstore


# ── Retriever untuk dipakai Agent ─────────────────────────────────────────────
def get_retriever():
    vectorstore = load_vectorstore()
    return vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 3},  # ambil 3 chunk paling relevan
    )


# ── Test query ────────────────────────────────────────────────────────────────
def test_query(query: str):
    retriever = get_retriever()
    results = retriever.invoke(query)
    print(f"\nQuery: '{query}'")
    print("-" * 50)
    for i, doc in enumerate(results, 1):
        print(f"[{i}] {doc.page_content[:200]}...")
        print()


# ── Main: jalankan setup ──────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=== Setup RAG Knowledge Base ===\n")

    print("[1/3] Loading dokumen...")
    docs = load_documents()
    print(f"Total dokumen: {len(docs)}\n")

    print("[2/3] Splitting dokumen menjadi chunks...")
    chunks = split_documents(docs)
    print(f"Total chunks: {len(chunks)}\n")

    print("[3/3] Membuat vectorstore di ChromaDB...")
    build_vectorstore(chunks)

    print("\n=== Setup selesai! ===")
    print("\nTest query:")
    test_query("berapa batas waktu duduk saat jam sibuk?")
    test_query("apa yang harus dilakukan staff jika customer melewati batas waktu?")
