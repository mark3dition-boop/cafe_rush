import sys
import os
from pathlib import Path

# Agar bisa mengimport modul dari root project
sys.path.append(str(Path(__file__).parent.parent))

from langchain_core.tools import tool
from rag.setup_rag import get_retriever

@tool
def query_cafe_policy(query: str) -> str:
    """Gunakan tool ini HANYA JIKA Anda butuh mengetahui aturan kafe, batas waktu, prosedur staff, atau rekomendasi menu upsell."""
    retriever = get_retriever()
    docs = retriever.invoke(query)
    
    if not docs:
        return "Tidak ada kebijakan yang ditemukan terkait hal ini."
        
    # Gabungkan teks dari hasil RAG
    combined_docs = "\n\n---\n\n".join([doc.page_content for doc in docs])
    return f"Hasil pencarian dari kebijakan kafe:\n{combined_docs}"

@tool
def get_current_context() -> str:
    """Gunakan tool ini untuk mengetahui jam dan kondisi saat ini (apakah peak hour atau bukan)."""
    # Untuk keperluan demo Hackathon, kita mock waktunya agar bisa mendemonstrasikan Peak Hour
    # Di production, gunakan datetime.now()
    simulated_time = "12:30" 
    return f"Waktu sistem saat ini adalah {simulated_time} (Jam Sibuk / Peak Hour)."

# Daftar tools yang akan dimasukkan ke dalam Agent
cafe_tools = [query_cafe_policy, get_current_context]
