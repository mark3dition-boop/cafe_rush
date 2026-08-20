from agent.workflow import agent_workflow

# Mengambil visual graf dari LangGraph dan menyimpannya sebagai PNG
image_bytes = agent_workflow.get_graph().draw_mermaid_png()

with open("workflow_visual.png", "wb") as f:
    f.write(image_bytes)

print("Berhasil disimpan sebagai workflow_visual.png!")
