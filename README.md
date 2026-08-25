# Cafe Rush

Smart Table Management & Upselling Assistant — dibuat untuk COMPFEST 18 AI Innovation Challenge (Smart Commerce).

Sistem ini menggabungkan computer vision (YOLO Pose) dengan agentic AI (LangGraph + RAG) untuk membantu staff kafe mengelola meja pelanggan. Kamera mendeteksi siapa yang duduk dan sudah berapa lama, lalu AI menganalisis data tersebut berdasarkan SOP kafe dan memberikan instruksi yang sopan untuk staff — kapan harus menawarkan menu tambahan, kapan harus mengingatkan batas waktu, dan bagaimana cara menyampaikannya.

---

## Kenapa ini dibuat?

Masalah klasik di kafe: saat jam sibuk, ada pelanggan yang duduk berjam-jam tanpa order tambahan sementara antrian mengular. Staff tidak punya cara sopan untuk mengelola situasi ini tanpa menyinggung pelanggan.

Solusi kami: biarkan AI yang memantau dan merangkai kata-kata. Staff tinggal membaca instruksi di layar dan menyampaikannya.

---

## Cara kerjanya

```
Kamera (YOLO Pose)                          AI Backend (LangGraph)
─────────────────                          ────────────────────────
Deteksi orang duduk ──▶ Hitung durasi ──▶ HTTP POST ke API ──▶ Cek waktu (peak/off-peak)
                                                                      │
                                                                      ▼
                                                               Baca data sensor
                                                                      │
                                                                      ▼
                                                               Query SOP kafe (RAG)
                                                                      │
                                                                      ▼
                                                               LLM rangkai instruksi
                                                                      │
                                                                      ▼
                                                               Kirim balik ke terminal
```

Secara teknis, AI backend-nya adalah LangGraph StateGraph dengan 4 node yang jalan berurutan:

1. **Check_Time_Context** — Tentukan sekarang peak hour atau bukan
2. **Check_Sensor_Data** — Terima data dari YOLO (jumlah orang, durasi duduk)
3. **Retrieve_RAG_Policy** — Cari aturan SOP yang relevan dari ChromaDB
4. **Decision_Engine** — Qwen 3.6-27B merangkum semuanya jadi instruksi untuk staff

Output-nya terstruktur begini:
```
[STATUS] Warning
[ANALISIS] Meja 3 terisi 4 orang, sudah 150 menit di jam sibuk. Sisa 30 menit.
[ACTION] "Selamat siang, apakah ada yang bisa kami bantu untuk pesan tambahan?..."
```

---

## Struktur folder

```
cafe_rush/
├── main.py                  # CV pipeline — YOLO + sitting detection + kirim ke AI
├── session_manager.py       # Hitung durasi duduk per orang (by track ID)
├── requirements.txt         # ultralytics, opencv
│
└── ai_backend/
    ├── agent/workflow.py     # StateGraph 4-node pipeline
    ├── api/main.py           # FastAPI server (port 8000)
    ├── knowledge_base/       # Dokumen SOP kafe (txt)
    │   ├── cafe_policy.txt   # Aturan batas waktu duduk
    │   ├── menu_upsell.txt   # Rekomendasi menu
    │   └── staff_sop.txt     # SOP staff
    ├── rag/setup_rag.py      # ChromaDB + HuggingFace embeddings
    ├── tools/table_tools.py  # LangChain tools
    ├── main.py               # CLI tester (tanpa kamera)
    ├── requirements.txt      # Dependencies AI
    └── .env.example          # Template API key
```

---

## Tech stack

| Komponen | Teknologi |
|----------|-----------|
| Object detection & pose | YOLOv26s-Pose + OpenCV |
| Session tracking | Custom Python (dataclass-based) |
| Agentic workflow | LangGraph StateGraph |
| LLM | Qwen 3.6-27B via Groq |
| Knowledge retrieval | ChromaDB + `paraphrase-multilingual-MiniLM-L12-v2` |
| API | FastAPI + Uvicorn |
| Integrasi CV-AI | `requests` + `threading` (async di background) |

---

## Cara menjalankan

Butuh Python 3.10+ dan [Groq API key](https://console.groq.com/) (gratis).

### 1. Clone

```bash
git clone https://github.com/mark3dition-boop/cafe_rush.git
cd cafe_rush
```

### 2. Nyalakan AI Backend (terminal pertama)

```bash
cd ai_backend
pip install -r requirements.txt

# Buat file .env dari template, isi GROQ_API_KEY
cp .env.example .env

# Jalankan server
python api/main.py
```

Server jalan di `http://localhost:8000`. Bisa dicoba langsung di `http://localhost:8000/docs`.

### 3. Nyalakan CV Pipeline (terminal kedua)

```bash
# Kembali ke root folder cafe_rush/
pip install -r requirements.txt
pip install requests

python main.py
```

Pastikan AI backend sudah jalan sebelum menjalankan CV. Setiap ada orang terdeteksi duduk selama kelipatan 1 menit, YOLO otomatis nembak data ke AI dan hasilnya muncul di terminal.

---

## API

### POST `/api/analyze-table`

```json
// Request
{
  "table_id": "3",
  "person_count": 4,
  "duration_minutes": 150
}

// Response
{
  "table_id": "3",
  "recommendation": "[STATUS] Warning\n[ANALISIS] Meja 3 terisi 4 orang..."
}
```

---

## Tim

Dibuat untuk COMPFEST 18 AI Innovation Challenge — kategori Smart Commerce.
