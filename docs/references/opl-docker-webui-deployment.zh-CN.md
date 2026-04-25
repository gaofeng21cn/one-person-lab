[English](./opl-docker-webui-deployment.md) | **中文**

# OPL Docker WebUI 部署参考

这份参考文档面向在 Linux 服务器、Docker 容器或浏览器访问路径中部署 One Person Lab 的使用者和维护者。

## 当前 WebUI 边界

面向用户的 WebUI 是 `opl-aion-shell` 维护的 One Person Lab 品牌 AionUI 壳，并以 One Person Lab App / WebUI 构建产物发布。OPL 主仓继续负责安装入口、运行时合同、模块管理和文档。

已退役的 headless Product API Web surface 不是用户 WebUI 入口。新的部署说明不要把历史本地 Product API 端口写成浏览器入口。

## Docker 镜像

从 `opl-aion-shell` 仓库构建 WebUI 镜像：

```bash
git clone https://github.com/gaofeng21cn/opl-aion-shell.git
cd opl-aion-shell
docker build -t one-person-lab-webui .
```

Docker 构建默认使用简体中文界面。需要改成其他默认语言时：

```bash
docker build \
  --build-arg VITE_OPL_DEFAULT_LANGUAGE=en-US \
  -t one-person-lab-webui .
```

## 标准浏览器访问

用持久化数据目录和远程浏览器访问启动 WebUI：

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e ALLOW_REMOTE=true \
  -e DATA_DIR=/data \
  one-person-lab-webui
```

打开：

```text
http://127.0.0.1:3000/
```

服务器部署时，应把这个端口放在可信反向代理、TLS 和访问控制层之后。

## 可信部署免登录模式

如果 Docker 环境已经由宿主机、VPN、反向代理或平台网关负责访问控制，可以让 WebUI 直接进入界面：

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e ALLOW_REMOTE=true \
  -e DATA_DIR=/data \
  -e OPL_WEBUI_AUTH_MODE=none \
  one-person-lab-webui
```

`OPL_WEBUI_AUTH_MODE=none` 只适合本机、私有网络或已经完成鉴权的可信部署。不要把免登录容器直接暴露到公网。

兼容别名：

```bash
-e AIONUI_WEBUI_AUTH_MODE=none
```

## 容器中的 Codex 默认配置

OPL 在安装或运行时从环境变量读取 Codex 默认配置。这些值不是写死在 Dockerfile 里，而是通过 `docker run -e`、Docker Compose `environment:`、部署平台环境变量或 secret manager 注入。

| 变量 | 用途 |
| --- | --- |
| `CODEX_HOME` | 容器内 Codex 配置目录，例如 `/data/codex` |
| `OPL_CODEX_MODEL` | 写入 `CODEX_HOME/config.toml` 的默认 Codex 模型 |
| `OPL_CODEX_REASONING_EFFORT` | 默认 reasoning effort，例如 `xhigh` |
| `OPL_CODEX_BASE_URL` | 第三方 OpenAI-compatible API base URL |
| `OPL_CODEX_API_KEY` | 对应 provider 的 API key |

示例：

```bash
docker run --rm \
  -p 3000:3000 \
  -v opl-data:/data \
  -e ALLOW_REMOTE=true \
  -e DATA_DIR=/data \
  -e CODEX_HOME=/data/codex \
  -e OPL_CODEX_MODEL=gpt-5.5 \
  -e OPL_CODEX_REASONING_EFFORT=xhigh \
  -e OPL_CODEX_BASE_URL=https://your-provider.example/v1 \
  -e OPL_CODEX_API_KEY=sk-... \
  one-person-lab-webui
```

安装和维护日志可以报告是否检测到 API key，但不应打印 key 的值。

## Docker Compose 示例

```yaml
services:
  one-person-lab:
    image: one-person-lab-webui:latest
    ports:
      - "3000:3000"
    volumes:
      - opl-data:/data
    environment:
      ALLOW_REMOTE: "true"
      DATA_DIR: /data
      CODEX_HOME: /data/codex
      OPL_WEBUI_AUTH_MODE: none
      OPL_CODEX_MODEL: gpt-5.5
      OPL_CODEX_REASONING_EFFORT: xhigh
      OPL_CODEX_BASE_URL: https://your-provider.example/v1
      OPL_CODEX_API_KEY: ${OPL_CODEX_API_KEY}

volumes:
  opl-data:
```

`OPL_CODEX_API_KEY` 应放在宿主机 shell、部署平台 secrets 或不提交到代码仓库的 `.env` 文件里。

## 验证

确认容器正在提供 WebUI：

```bash
curl -fsS http://127.0.0.1:3000/
```

免登录模式下，auth endpoint 应返回内置 no-auth session：

```bash
curl -fsS http://127.0.0.1:3000/api/auth/user
```

预期结构：

```json
{
  "success": true,
  "user": {
    "id": "opl-webui-noauth",
    "username": "admin"
  }
}
```

## 运行维护说明

- 持久化 `/data`，让 workspace、Codex 配置、缓存和 WebUI 状态在容器重启后保留。
- 容器内建议使用 `CODEX_HOME=/data/codex`，让 Codex 默认配置跟随 OPL 状态一起保存。
- provider API key 使用部署 secrets 管理。
- OPL 主仓继续作为安装入口和合同来源；`opl-aion-shell` 作为 WebUI 实现和构建来源。
