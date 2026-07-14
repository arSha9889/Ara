from pydantic import BaseModel


class UploadOut(BaseModel):
    media_url: str
    media_name: str
    media_mime_type: str
    media_size_bytes: int
    suggested_message_type: str

