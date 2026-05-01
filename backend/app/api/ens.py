from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter

from app.services.ens import resolve_owned_ens_names, resolve_primary_ens_name

router = APIRouter(prefix="/ens", tags=["ens"])


class PrimaryEnsResponse(BaseModel):
    address: str = Field(description="Wallet address queried")
    primary_ens: str | None = Field(default=None, description="Primary ENS reverse record, if any")
    verified: bool = Field(description="Whether the reverse name also resolves forward to this wallet")


class OwnedEnsResponse(BaseModel):
    address: str = Field(description="Wallet address queried")
    names: list[str] = Field(default_factory=list, description="ENS names associated with this wallet")


@router.get("/primary/{address}", response_model=PrimaryEnsResponse)
async def get_primary_ens(address: str) -> PrimaryEnsResponse:
    primary_ens, verified = await resolve_primary_ens_name(address)
    return PrimaryEnsResponse(address=address, primary_ens=primary_ens, verified=verified)


@router.get("/owned/{address}", response_model=OwnedEnsResponse)
async def get_owned_ens_names(address: str) -> OwnedEnsResponse:
    names = await resolve_owned_ens_names(address)
    return OwnedEnsResponse(address=address, names=names)
