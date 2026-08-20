import os
import sys
from pathlib import Path

# Pastikan environment variable sudah di-load dan API key tersedia
from dotenv import load_dotenv
load_dotenv()

# Jika API key tidak ada atau masih default, script akan dihentikan
if not os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_API_KEY") == "your_groq_api_key_here":
    print("ERROR: Silakan isi GROQ_API_KEY di file .env terlebih dahulu!")
    sys.exit(1)

from agent.workflow import agent_workflow

def test_table_analysis(table_id: str):
    print(f"\n{'='*60}")
    print(f"MENGANALISIS MEJA {table_id}...")
    print(f"{'='*60}")
    
    # Input ke Custom Graph
    inputs = {"table_id": table_id}
    
    # Menjalankan agent step-by-step
    for event in agent_workflow.stream(inputs):
        for node_name, state_update in event.items():
            print(f"🔄 Berhasil melewati node: {node_name}")
            
            # Jika sudah sampai node terakhir, print hasilnya
            if "final_output" in state_update:
                print(f"\n[OUTPUT FINAL]:\n\n{state_update['final_output']}")

if __name__ == "__main__":
    print("Mulai simulasi AI Agent Workflow...\n")
    
    # Test Skenario 1: Meja baru duduk (15 menit) -> Harusnya AMAN
    test_table_analysis("1")
    
    # Test Skenario 2: Meja 65 menit + piring kosong -> Harusnya WARNING / UPSELL
    test_table_analysis("2")
    
    # Test Skenario 3: Meja 150 menit tapi VIP -> Harusnya AMAN (kebal waktu)
    test_table_analysis("3")
