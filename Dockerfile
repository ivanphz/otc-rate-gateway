# 使用官方轻量级 Node 20 镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 仅拷贝依赖清单，利用缓存加速安装
COPY package*.json ./
RUN npm install

# 拷贝全部源码
COPY src/ ./src/

# 暴露给宿主机的端口
EXPOSE 3000

# 启动命令
CMD ["npm", "start"]