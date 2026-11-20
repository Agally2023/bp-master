FROM python:3.12-slim
WORKDIR /app
COPY engine/requirements.txt engine/requirements.txt
RUN pip install --no-cache-dir -r engine/requirements.txt
COPY engine/ engine/
COPY web/modules.json web/modules.json
# The weekly template ships inside this PRIVATE repository (engine/templates). Never make the repo or the image public.
ENV TEMPLATE=/app/engine/templates/VF_BP_Weekly_Template.pptx PORT=8787
USER nobody
EXPOSE 8787
CMD ["python", "-I", "engine/server.py"]
