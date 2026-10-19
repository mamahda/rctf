import random

from aiodocker import Docker
from fastapi import HTTPException

from instancer.core.cache import redis
from instancer.core.config import config
from instancer.core.instancer.const import ContainerLabels
from instancer.core.instancer.traefik import SEPARATOR
from instancer.protocol import types as protocol


OUT_OF_PORTS_ERROR = HTTPException(
    status_code=500,
    detail='Instancer has run out of available ports for exposing instances. Contact admins.',
)


def _reservation_key(port: int) -> str:
    return f'{config.PREFIX}:ports:{port}'


async def _get_used_ports(docker: Docker) -> set[int]:
    containers = await docker.containers.list(
        all=True,
        filters={'label': [f'{ContainerLabels.MANAGED_BY}={config.DOCKER_MANAGER_NAME}']},
    )

    used: set[int] = set()
    for container in containers:
        raw_ports = (container['Labels'] or {}).get(ContainerLabels.EXPOSED_PORTS, '')
        used.update(int(port) for port in raw_ports.split(SEPARATOR) if port)
    return used


async def allocate_ports(docker: Docker, count: int) -> list[int]:
    if count == 0:
        return []

    # Ports of created containers are tracked through their labels, while reservations in redis cover the window
    # between picking a port and creating the container that publishes it
    used = await _get_used_ports(docker)
    candidates = [port for port in range(config.PORT_RANGE_START, config.PORT_RANGE_END + 1) if port not in used]
    random.shuffle(candidates)

    allocated: list[int] = []
    for port in candidates:
        if await redis.set(_reservation_key(port), '1', nx=True, ex=config.PORT_RESERVATION_SECONDS):
            allocated.append(port)
            if len(allocated) == count:
                return allocated

    await release_ports(allocated)
    raise OUT_OF_PORTS_ERROR


async def release_ports(ports: list[int]) -> None:
    if ports:
        await redis.delete(*[_reservation_key(port) for port in ports])


def publish_ports(
    labels: dict[str, str],
    svc_name: str,
    exposes: dict[str, list[protocol.InstancerExpose]],  # container: exposes
    global_indices: list[int],
    host_ports: dict[int, int],  # global expose index: host port
) -> tuple[dict[str, list[dict[str, str]]], list[protocol.RCTFInstanceDetails.Endpoint]]:
    to_expose = exposes.get(svc_name, [])
    ports = [host_ports[i] for i in global_indices]

    labels[ContainerLabels.EXPOSED_KINDS] = SEPARATOR.join(k.kind for k in to_expose)
    labels[ContainerLabels.EXPOSED_INDICES] = SEPARATOR.join(str(i) for i in global_indices)
    labels[ContainerLabels.EXPOSED_HOSTNAMES] = SEPARATOR.join(config.INSTANCES_HOST for _ in to_expose)
    labels[ContainerLabels.EXPOSED_PORTS] = SEPARATOR.join(str(port) for port in ports)

    port_bindings: dict[str, list[dict[str, str]]] = {}
    exposed: list[protocol.RCTFInstanceDetails.Endpoint] = []
    for expose, port in zip(to_expose, ports, strict=True):
        port_bindings.setdefault(f'{expose.container_port}/tcp', []).append({'HostIp': '', 'HostPort': str(port)})
        exposed.append(protocol.RCTFInstanceDetails.Endpoint(kind=expose.kind, host=config.INSTANCES_HOST, port=port))

    return port_bindings, exposed
