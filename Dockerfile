# ---------- 构建阶段 ----------
FROM node:18-alpine AS builder

WORKDIR /app

# 仅复制依赖描述文件，利用缓存
COPY package*.json ./

# 安装所有依赖（含 devDependencies，用于可能的编译）
RUN npm ci

# ---------- 运行阶段 ----------
FROM node:18-alpine

WORKDIR /app

# 安装生产依赖
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# 从构建阶段复制 node_modules（可选，若需保留 dev 工具）
# COPY --from=builder /app/node_modules ./node_modules

# 复制应用代码
COPY . .

# 暴露端口
EXPOSE 3000

# 健康检查（可选）
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# 启动命令
CMD ["node", "index.js"]