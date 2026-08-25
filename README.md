# ☕ Cafe Rush — Smart Table Management & Upselling Assistant

**COMPFEST 18 AI Innovation Challenge — Smart Commerce**

Sistem AI terintegrasi yang menggabungkan **Computer Vision (YOLO Pose)** dan **Agentic AI (LangGraph + RAG)** untuk membantu manajemen meja kafe secara cerdas. Sistem mendeteksi pelanggan duduk secara real-time melalui kamera CCTV, menghitung durasi kunjungan, lalu memberikan instruksi hospitality yang sopan dan kontekstual kepada staff melalui AI.

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────────┐       HTTP POST        ┌─────────────────────────────────┐
│   Computer Vision   │ ────────────────────▶   │         AI Backend              │
│   (YOLO Pose)       │  /api/analyze-table     │         (LangGraph)             │
│                     │                         │                                 │
│  • Deteksi orang    │       JSON Response     │  ┌──────────────────────────┐   │
│  • Pose estimation  │ ◀────────────────────   │  │  Check_Time_Context      │   │
│  • Sitting/Standing │                         │  │         ▼                │   │
│  • Durasi duduk     │                         │  │  Check_Sensor_Data       │   │
│  • Tracking (ID)    │                         │  │         ▼                │   │
└─────────────────────┘                         │  │  Retrieve_RAG_Policy     │   │
                                                │  │         ▼                │   │
                                                │  │  Decision_Engine (LLM)   │   │
                                                │  └──────────────────────────┘   │
                                                │                                 │
                                                │  • RAG: ChromaDB + SOP Kafe     │
                                                │  • LLM: Qwen 3.6-27B (Groq)    │
                                                │  • API: FastAPI (Port 8000)     │
                                                └─────────────────────────────────┘
```

---

## 📂 Struktur Proyek

```
cafe_rush/
│
├── main.py                  # CV Pipeline — YOLO Pose + Sitting Detection + Integrasi AI
├── session_manager.py       # Session tracking — Menghitung durasi duduk per orang
├── requirements.txt         # Dependencies untuk CV (ultralytics, opencv)
│
├── ai_backend/              # AI Agentic Workflow (LangGraph + RAG)
│   ├── agent/
│   │   └── workflow.py      # Custom StateGraph — 4 Node Pipeline
│   ├── api/
│   │   └── main.py          # FastAPI Server — Endpoint /api/analyze-table
│   ├── knowledge_base/      # Dokumen SOP Kafe (sumber data RAG)
│   │   ├── cafe_policy.txt  # Aturan batas waktu duduk
│   │   ├── menu_upsell.txt  # Rekomendasi menu upselling
│   │   └── staff_sop.txt    # Prosedur standar operasional staff
│   ├── mock/
│   │   └── cv_mock.py       # Data simulasi untuk testing tanpa kamera
│   ├── rag/
│   │   └── setup_rag.py     # Setup ChromaDB + HuggingFace Embeddings
│   ├── tools/
│   │   └── table_tools.py   # LangChain Tools — Query RAG & Konteks Waktu
│   ├── main.py              # CLI Tester — Simulasi workflow via terminal
│   ├── requirements.txt     # Dependencies untuk AI Backend
│   ├── .env.example         # Template API Key
│   └── workflow_visual.png  # Diagram visual LangGraph
│
└── link_video               # Link demo video
```

---

## 🔧 Tech Stack

| Layer | Teknologi | Fungsi |
|-------|-----------|--------|
| **Computer Vision** | YOLOv26s-Pose, OpenCV, Ultralytics | Deteksi orang, pose estimation, klasifikasi sitting/standing |
| **Session Tracking** | Python (custom) | Menghitung durasi duduk per ID orang, grace period tracking |
| **AI Framework** | LangGraph (StateGraph) | Agentic workflow — pipeline 4 node deterministik |
| **LLM** | Qwen 3.6-27B via Groq API | Decision engine — merangkai instruksi hospitality untuk staff |
| **RAG** | ChromaDB + HuggingFace Embeddings | Mengambil aturan SOP kafe yang relevan secara dinamis |
| **Embedding Model** | `paraphrase-multilingual-MiniLM-L12-v2` | Embedding multilingual (support Bahasa Indonesia) |
| **API Server** | FastAPI + Uvicorn | REST API untuk komunikasi antara CV dan AI Backend |
| **Integrasi** | `requests` + `threading` | HTTP async di background agar video tidak lag |

---

## 🚀 Cara Menjalankan

### Prasyarat
- Python 3.10+
- [Groq API Key](https://console.groq.com/) (gratis)
- Webcam / file video untuk testing CV

### 1. Clone Repository
```bash
git clone https://github.com/mark3dition-boop/cafe_rush.git
cd cafe_rush
```

### 2. Setup AI Backend
```bash
cd ai_backend

# Install dependencies
pip install -r requirements.txt

# Siapkan API Key
cp .env.example .env
# Edit file .env dan masukkan GROQ_API_KEY Anda

# (Opsional) Setup RAG Knowledge Base
python rag/setup_rag.py

# Jalankan API Server
python api/main.py
```
Server akan berjalan di `http://localhost:8000`. Swagger UI tersedia di `http://localhost:8000/docs`.

### 3. Setup Computer Vision
```bash
# Buka terminal baru, kembali ke folder cafe_rush/
cd cafe_rush

# Install dependencies
pip install -r requirements.txt
pip install requests

# Jalankan CV Pipeline
python main.py
```

> **Catatan:** Pastikan AI Backend (langkah 2) sudah berjalan sebelum menjalankan CV Pipeline. YOLO akan otomatis mengirim data ke AI setiap pelanggan terdeteksi duduk selama kelipatan 1 menit.

---

## 📡 API Reference

### `POST /api/analyze-table`

Menganalisis status meja dan memberikan rekomendasi aksi untuk staff.

**Request Body:**
```json
{
  "table_id": "3",
  "person_count": 4,
  "duration_minutes": 150
}
```

**Response:**
```json
{
  "table_id": "3",
  "recommendation": "[STATUS] Warning\n[ANALISIS] Meja 3 terisi 4 orang dengan durasi duduk 150 menit. Saat ini sedang jam sibuk (Peak Hour) dengan batas maksimal 180 menit, sehingga sisa waktu tinggal 30 menit.\n[ACTION] Sampaikan pengingat batas waktu secara sopan dan tawarkan pemesanan ulang. Kalimat: \"Selamat siang, apakah ada yang bisa kami bantu untuk pesan tambahan?\""
}
```

---

## 🧠 Cara Kerja AI Workflow

Sistem menggunakan **LangGraph StateGraph** dengan 4 node yang dieksekusi secara deterministik:

| Node | Fungsi |
|------|--------|
| `Check_Time_Context` | Mengambil konteks waktu (Peak Hour / Off-Peak) |
| `Check_Sensor_Data` | Menerima data dari YOLO (jumlah orang, durasi duduk) |
| `Retrieve_RAG_Policy` | Query ChromaDB untuk mengambil SOP kafe yang relevan |
| `Decision_Engine` | LLM merangkum seluruh data menjadi instruksi aksi untuk staff |

**Output AI mengikuti format terstruktur:**
- **[STATUS]** — `Aman` / `Warning` / `Alert`
- **[ANALISIS]** — Kondisi meja saat ini secara ringkas
- **[ACTION]** — Tindakan staff beserta kalimat yang harus diucapkan ke customer

---

## 👥 Tim

Proyek ini dikembangkan untuk **COMPFEST 18 AI Innovation Challenge** — kategori Smart Commerce.

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan kompetisi hackathon.
