from __future__ import annotations

from typing import Optional, List, Tuple, Type
from importlib import import_module
import requests
from django.utils import timezone

from .models import TeamServiceInstance


class BaseChecker:
    """
    Base interface for challenge checkers.
    Implementations should provide:
      - health_ok(instance, config): for AD defense uptime
      - koth_owner(instances, config): for KotH ownership detection
    """

    def health_ok(self, instance: TeamServiceInstance, config: dict) -> bool:
        raise NotImplementedError

    def koth_owner(self, instances: List[TeamServiceInstance], config: dict) -> Optional[int]:
        raise NotImplementedError


class HttpChecker(BaseChecker):
    """
    Simple HTTP-based checker:
      - health_ok: GET endpoint_url + health_path; 200 OK means healthy
      - koth_owner: GET endpoint_url + proof_path and parse proof_keyword, fallback to first healthy instance's team
    """

    def _http_get(self, url: str, timeout: float = 3.0) -> Tuple[int, str]:
        try:
            r = requests.get(url, timeout=timeout)
            return r.status_code, r.text or ""
        except Exception:
            return 0, ""

    def _join(self, base: str, path: str) -> str:
        if not path:
            return base
        return base.rstrip("/") + "/" + path.lstrip("/")

    def health_ok(self, instance: TeamServiceInstance, config: dict) -> bool:
        if not instance.endpoint_url:
            return False
        path = (config or {}).get("health_path", "")
        url = self._join(instance.endpoint_url, path)
        status, _body = self._http_get(url)
        return status == 200

    def koth_owner(self, instances: List[TeamServiceInstance], config: dict) -> Optional[int]:
        proof_path = (config or {}).get("proof_path", "")
        keyword = (config or {}).get("proof_keyword", "owned_by:")
        for inst in instances:
            if not inst.endpoint_url:
                continue
            url = self._join(inst.endpoint_url, proof_path)
            status, body = self._http_get(url)
            inst.last_check_at = timezone.now()
            inst.save(update_fields=["last_check_at"])
            if status == 200:
                if body and keyword in body:
                    try:
                        idx = body.find(keyword)
                        tid = int(body[idx + len(keyword) :].strip().split()[0])
                        if tid == inst.team_id:
                            return tid
                    except Exception:
                        pass
                return inst.team_id
        return None


def get_checker(config: dict) -> BaseChecker:
    """
    Select checker implementation from config.
    - checker_path: "module:ClassOrFactory" or "module:function"
      If omitted, uses HttpChecker.
    """
    path = (config or {}).get("checker_path")
    if not path:
        return HttpChecker()
    try:
        mod_name, attr_name = path.split(":", 1)
        mod = import_module(mod_name)
        obj = getattr(mod, attr_name)
        if isinstance(obj, type):
            if issubclass(obj, BaseChecker):
                return obj()
        if callable(obj):
            inst = obj()
            if isinstance(inst, BaseChecker):
                return inst
    except Exception:
        pass
    return HttpChecker()