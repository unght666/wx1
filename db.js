// db.js
const { Sequelize, DataTypes } = require("sequelize");

// 从环境变量读取配置
const {
  MYSQL_USERNAME,
  MYSQL_PASSWORD,
  MYSQL_ADDRESS,
  DB_NAME = "miniprogram_login",
} = process.env;

const [host, port] = MYSQL_ADDRESS.split(":");

// 创建 Sequelize 实例
const sequelize = new Sequelize(DB_NAME, MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port: parseInt(port) || 3306,
  dialect: "mysql",
  logging: false, // 设为 console.log 可查看 SQL 日志
  define: {
    underscored: true,       // 字段名自动映射为下划线格式 (createdAt -> created_at)
    timestamps: true,        // 自动维护 createdAt / updatedAt
  },
});

// ------------------- 定义 User 模型 -------------------
const User = sequelize.define("User", {
  id: {
    type: DataTypes.STRING(36),
    primaryKey: true,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  passwordHash: {
    type: DataTypes.STRING(255),
    field: "password_hash",
    allowNull: true,
  },
  openid: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true,
  },
  nickname: {
    type: DataTypes.STRING(50),
    defaultValue: "新用户",
  },
  avatar: {
    type: DataTypes.STRING(500),
    defaultValue: "",
  },
  // db.js 中的 User 定义里增加：
lastData: {
  type: DataTypes.TEXT,        // 或 DataTypes.JSON (MySQL 5.7.8+ 支持 JSON 类型)
  allowNull: true,
  field: 'last_data',
  defaultValue: null,
  comment: '用户上一次保存的业务数据（JSON字符串）',
},
}, {
  tableName: "users",
  timestamps: true,
  createdAt: "created_at",
  updatedAt: "updated_at",
});

// ------------------- 辅助函数：生成唯一 ID -------------------
function generateId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `user_${timestamp}_${random}`;
}

// ------------------- 导出的数据库操作函数 -------------------

/**
 * 根据账号（手机号或用户名）查找用户
 */
async function findUserByAccount(account) {

  const user = await User.findOne({
    where: {
      [Sequelize.Op.or]: [
        { phone: account },
        { username: account },
      ],
    },
    raw: true, // 返回纯对象
  });
  if (!user) return null;
  // 字段名称转换（因为 raw 返回下划线格式，统一成驼峰供业务层使用）
  return {
    id: user.id,
    phone: user.phone,
    username: user.username,
    passwordHash: user.password_hash,
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    createdAt: user.created_at,
    lastData: user.last_data, 
  };
}

/**
 * 根据手机号查找用户
 */
async function findUserByPhone(phone) {
  const user = await User.findOne({
    where: { phone },
    raw: true,
  });
  if (!user) return null;
  return {
    id: user.id,
    phone: user.phone,
    username: user.username,
    passwordHash: user.password_hash,
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    createdAt: user.created_at,
  };
}

/**
 * 创建新用户
 * @param {Object} data - 包含 phone, username, passwordHash, openid, nickname, avatar 等字段
 */
async function createUser(data) {
  const id = data.id || generateId();
  const user = await User.create({
    id,
    phone: data.phone,
    username: data.username || null,
    passwordHash: data.passwordHash || null,
    openid: data.openid || null,
    nickname: data.nickname || `手机用户${data.phone.slice(-4)}`,
    avatar: data.avatar || "",
  });
  // 返回与之前一致的结构
  return {
    id: user.id,
    phone: user.phone,
    username: user.username,
    passwordHash: user.passwordHash,
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    createdAt: user.createdAt,
  };
}

/**
 * 更新用户的 openid
 */
async function updateUserOpenid(userId, openid) {
  const user = await User.findByPk(userId);
  if (!user) return null;
  user.openid = openid;
  await user.save();
  return {
    id: user.id,
    phone: user.phone,
    username: user.username,
    passwordHash: user.passwordHash,
    openid: user.openid,
    nickname: user.nickname,
    avatar: user.avatar,
    createdAt: user.createdAt,
  };
}

/**
 * 初始化数据库：同步模型
 */
async function init() {
  try {
    await sequelize.authenticate();
    console.log("✅ Sequelize 连接数据库成功");
    await User.sync({ alter: true }); // 自动根据模型调整表结构（生产环境慎用，建议用迁移）
    console.log("✅ User 模型同步完成");
  } catch (error) {
    console.error("❌ 数据库初始化失败:", error);
    throw error;
  }
}

// ------------------- 导出 -------------------
module.exports = {
  init,
  findUserByAccount,
  findUserByPhone,
  createUser,
  updateUserOpenid,
  sequelize,    // 如需在别处使用事务等可导出
};