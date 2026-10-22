import importlib
import pkgutil
from types import ModuleType

from fastapi import APIRouter


def module_packages(package: str) -> list[str]:
    pkg = importlib.import_module(package)
    return [
        f"{package}.{info.name}"
        for info in sorted(pkgutil.iter_modules(pkg.__path__), key=lambda i: i.name)
        if info.ispkg
    ]


def _optional_import(name: str) -> ModuleType | None:
    try:
        return importlib.import_module(name)
    except ModuleNotFoundError as exc:
        if exc.name == name:
            return None
        raise


def discover_routers(package: str, attr: str = "router") -> list[APIRouter]:
    routers = []
    for module in module_packages(package):
        routes = _optional_import(f"{module}.routes")
        router = getattr(routes, attr, None) if routes else None
        if isinstance(router, APIRouter):
            routers.append(router)
    return routers


def import_models(package: str = "app.modules") -> None:
    for area in module_packages(package):
        for module in module_packages(area):
            pkg = importlib.import_module(module)
            for info in pkgutil.iter_modules(pkg.__path__):
                if info.name == "models" or info.name.endswith("_model"):
                    importlib.import_module(f"{module}.{info.name}")
