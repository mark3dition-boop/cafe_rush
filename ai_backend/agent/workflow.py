import os
import sys
from typing import TypedDict
from pathlib import Path
from dotenv import load_dotenv

sys.path.append(str(Path(__file__).parent.parent))

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
from langgraph.graph import StateGraph, START, END

# Import tools manual yang sudah kita buat
from tools.table_tools import get_table_status, query_cafe_policy, get_current_context

load_dotenv()

if not os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_API_KEY") == "your_groq_api_key_here":
    print("WARNING: GROQ_API_KEY belum di-set di file .env!")

# Inisialisasi LLM
llm = ChatGroq(model="qwen/qwen3.6-27b", temperature=0)

# 1. Definisikan Skema State (Data yang dilempar dari kotak ke kotak)
class WorkflowState(TypedDict):
    table_id: str
    time_context: str
    table_data: str
    rag_rules: str
    final_output: str

# 2. Definisikan Nodes (Fungsi/Langkah di setiap kotak)
def check_time_node(state: WorkflowState):
    """Mengambil data konteks waktu cafe saat ini."""
    time_info = get_current_context.invoke({})
    return {"time_context": time_info}

def check_sensor_node(state: WorkflowState):
    """Membaca data sensor meja dari Mock CV."""
    t_id = state["table_id"]
    table_info = get_table_status.invoke({"table_id": t_id})
    return {"table_data": table_info}

def retrieve_policy_node(state: WorkflowState):
    """Melakukan query ke RAG berdasarkan data meja dan waktu."""
    # Kita menyuruh RAG mencari spesifik aturan jam tersebut
    query = f"Batas waktu meja di {state['time_context']} dan rekomendasi upsell"
    rules = query_cafe_policy.invoke({"query": query})
    return {"rag_rules": rules}

def decision_engine_node(state: WorkflowState):
    """LLM merangkum semua data dan memberikan keputusan aksi ke staff."""
    system_prompt = f"""
    Kamu adalah AI Cafe Manager Assistant.
    Tugasmu adalah memberikan instruksi ke staff berdasarkan 3 data konkrit ini:
    
    [KONTEKS WAKTU]: {state['time_context']}
    [DATA SENSOR MEJA]: {state['table_data']}
    [ATURAN KAFE (RAG)]: {state['rag_rules']}
    
    ATURAN OUTPUT:
    - Jangan sebutkan proses sistem internal kepada staff.
    - Berikan format output persis seperti ini:
      [STATUS] (Aman / Warning / Alert)
      [ANALISIS] (Kondisi meja saat ini secara ringkas)
      [ACTION] (Tindakan staff, kalimat apa yang harus diucapkan ke customer)
    """
    
    messages = [
        SystemMessage(content="Kamu adalah AI Cafe Manager Assistant."),
        HumanMessage(content=system_prompt)
    ]
    response = llm.invoke(messages)
    return {"final_output": response.content}

# 3. Rakit Graph (Workflow Visual yang Keren)
workflow = StateGraph(WorkflowState)

# Tambahkan nodes ke dalam graf
workflow.add_node("Check_Time_Context", check_time_node)
workflow.add_node("Check_Sensor_Data", check_sensor_node)
workflow.add_node("Retrieve_RAG_Policy", retrieve_policy_node)
workflow.add_node("Decision_Engine", decision_engine_node)

# Sambungkan urutannya (Garis panah antar kotak)
workflow.add_edge(START, "Check_Time_Context")
workflow.add_edge("Check_Time_Context", "Check_Sensor_Data")
workflow.add_edge("Check_Sensor_Data", "Retrieve_RAG_Policy")
workflow.add_edge("Retrieve_RAG_Policy", "Decision_Engine")
workflow.add_edge("Decision_Engine", END)

# Compile menjadi agent siap pakai
agent_workflow = workflow.compile()
