from fastapi import HTTPException, status


def not_implemented(feature: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=f'{feature} is planned for a later Web Core implementation stage.',
    )
