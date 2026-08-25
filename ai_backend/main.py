import os
import sys
from pathlib import Path

# Perbaiki masalah Unicode/Emoji di Terminal Windows (cp1252)
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# Pastikan environment variable sudah di-load dan API key tersedia
from dotenv import load_dotenv
load_dotenv()

# Jika API key tidak ada atau masih default, script akan dihentikan
if not os.environ.get("GROQ_API_KEY") or os.environ.get("GROQ_API_KEY") == "your_groq_api_key_here":
    print("ERROR: Silakan isi GROQ_API_KEY di file .env terlebih dahulu!")
    sys.exit(1)

from agent.workflow import agent_workflow

def test_table_analysis(table_id: str, person_count: int, duration_minutes: int):
    print(f"\n{'='*60}")
    print(f"MENGANALISIS MEJA {table_id}...")
    print(f"{'='*60}")
    
    # Input ke Custom Graph
    inputs = {
        "table_id": table_id,
        "person_count": person_count,
        "duration_minutes": duration_minutes
    }
    
    # Menjalankan agent step-by-step
    for event in agent_workflow.stream(inputs):
        for node_name, state_update in event.items():
            print(f"-> Berhasil melewati node: {node_name}")
            
            # Jika sudah sampai node terakhir, print hasilnya
            if "final_output" in state_update:
                print(f"\n[OUTPUT FINAL]:\n\n{state_update['final_output']}")

if __name__ == "__main__":
    print("Mulai simulasi AI Agent Workflow...\n")
    
    # Test simulasi menggunakan data asli yang diumpankan manual (mirip output YOLO)
    test_table_analysis("1", person_count=2, duration_minutes=15)
    test_table_analysis("2", person_count=3, duration_minutes=65)
    test_table_analysis("3", person_count=4, duration_minutes=150)
