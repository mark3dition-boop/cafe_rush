"""
Mock data untuk menyimulasikan output dari Computer Vision (YOLO + Tracker) 
serta sistem kasir (POS).
"""

# Simulasi data meja (Seolah-olah ini hasil deteksi CV)
MOCK_TABLES = {
    "1": {
        "table_id": "1",
        "person_count": 2,
        "duration_minutes": 15,
        "last_order_time": "15 menit lalu"
    },
    "2": {
        "table_id": "2",
        "person_count": 3,
        "duration_minutes": 65,
        "last_order_time": "50 menit lalu"
    },
    "3": {
        "table_id": "3",  # Ini meja VIP (sesuai SOP)
        "person_count": 4,
        "duration_minutes": 150,
        "last_order_time": "30 menit lalu"
    }
}

def get_mock_table_data(table_id: str) -> dict:
    """Mengambil data simulasi untuk meja tertentu."""
    return MOCK_TABLES.get(table_id, {"error": f"Meja {table_id} tidak ditemukan atau kosong."})
