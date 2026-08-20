import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from agent.workflow import agent_workflow

app = FastAPI(
    title="Cafe AI Workflow API",
    description="API untuk menganalisis status meja dan memberikan rekomendasi staff menggunakan LangGraph Agent",
    version="1.0.0"
)

# Skema Request Body
class TableAnalysisRequest(BaseModel):
    table_id: str

# Skema Response Body
class TableAnalysisResponse(BaseModel):
    table_id: str
    recommendation: str

@app.get("/")
def read_root():
    return {"message": "Cafe AI Workflow API is running. Go to /docs for Swagger UI."}

@app.post("/api/analyze-table", response_model=TableAnalysisResponse)
async def analyze_table(request: TableAnalysisRequest):
    """
    Endpoint ini akan menjalankan Custom StateGraph untuk meja yang diminta.
    Eksekusi dilakukan terstruktur dari mengambil waktu, sensor, hingga membaca RAG.
    """
    try:
        inputs = {"table_id": request.table_id}
        
        # Eksekusi StateGraph secara sinkron
        response_data = agent_workflow.invoke(inputs)
        
        # Ambil data final_output dari kamus (State) yang dikembalikan
        final_message = response_data["final_output"]
        
        return TableAnalysisResponse(
            table_id=request.table_id,
            recommendation=final_message
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Jalankan server FastAPI jika file ini dieksekusi langsung
    uvicorn.run(app, host="0.0.0.0", port=8000)
