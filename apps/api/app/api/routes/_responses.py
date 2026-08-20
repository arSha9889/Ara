from fastapi import HTTPException, status
from fastapi.responses import JSONResponse


def not_implemented(feature: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f'{feature} is planned for a later Web Core implementation stage.',
    )


def domain_error_response(exc: Exception, fallback_status_code: int) -> JSONResponse:
    status_code = getattr(exc, 'status_code', fallback_status_code)
    content = {'detail': str(exc)}
    if code := getattr(exc, 'code', None):
        content['code'] = code
    return JSONResponse(status_code=status_code, content=content)
