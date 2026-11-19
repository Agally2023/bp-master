FROM python:3.12-slim
RUN pip install --no-cache-dir python-pptx pandas pillow openpyxl numpy
WORKDIR /app
COPY engine/ engine/
COPY web/modules.json web/modules.json
# The weekly template is company content: mount it as a secret/volume, do not bake it into a public image.
ENV TEMPLATE=/secrets/VF_BP_Weekly_Template.pptx PORT=8787
USER nobody
EXPOSE 8787
CMD ["python", "-I", "engine/server.py"]
