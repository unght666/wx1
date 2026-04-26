//index.js

const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const { findUserByAccount, findUserByPhone, createUser, updateUserOpenid, sequelize} = require('./db');

const app = express();
app.use(express.json());


// ------------------- 工具函数 -------------------

function generateToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

async function code2Session(code) {
  const { WECHAT_APPID, WECHAT_SECRET } = process.env;
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&js_code=${code}&grant_type=authorization_code`;
  const res = await axios.get(url);
  if (res.data.errcode) {
    throw new Error(`微信登录失败: ${res.data.errmsg}`);
  }
  return { openid: res.data.openid, session_key: res.data.session_key };
}

// 全局 access_token 简单缓存（生产环境建议使用 Redis）
let cachedAccessToken = null;
let tokenExpireTime = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpireTime) {
    return cachedAccessToken;
  }

  const { WECHAT_APPID, WECHAT_SECRET } = process.env;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}`;
  const res = await axios.get(url);
  if (res.data.errcode) {
    throw new Error(`获取 access_token 失败: ${res.data.errmsg}`);
  }

  cachedAccessToken = res.data.access_token;
  tokenExpireTime = now + (res.data.expires_in - 300) * 1000; // 提前5分钟过期
  return cachedAccessToken;
}

async function getPhoneNumberByCode(code) {
  const access_token = await getAccessToken();
  const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${access_token}`;
  const res = await axios.post(url, { code });
  if (res.data.errcode !== 0) {
    throw new Error(`获取手机号失败: ${res.data.errmsg}`);
  }
  return res.data.phone_info.purePhoneNumber;
}

// ------------------- 路由 -------------------

// 健康检查
app.get('/health', (req, res) => res.send('OK'));

// 统一登录接口
app.post('/api/login', async (req, res) => {
  try {
    const { type } = req.body;

    // ---------- 密码登录 ----------
    if (type === 'password') {
      const { account, password } = req.body;
      if (!account || !password) {
        return res.status(400).json({ code: 400, message: '账号和密码不能为空' });
      }

      const user = await findUserByAccount(account);
      if (!user) {
        return res.status(401).json({ code: 401, message: '账号或密码错误' });
      }

      const isValid = await bcrypt.compare(password, user.password_Hash);
      if (!isValid) {
        return res.status(401).json({ code: 401, message: '账号或密码错误' });
      }

      // 在 /api/login 的密码分支中，添加：
const user = await findUserByAccount(account);
console.log('=== DEBUG LOGIN ===');
console.log('account:', account);
console.log('user found:', !!user);
if (user) {
  console.log('user.passwordHash type:', typeof user.passwordHash);
  console.log('user.passwordHash value:', user.passwordHash);
}
console.log('password from req type:', typeof password);

const isValid = await bcrypt.compare(password, user.passwordHash);
console.log('isValid:', isValid);

      const token = generateToken({ userId: user.id, phone: user.phone });
      return res.json({
        code: 0,
        message: '登录成功',
        data: {
          token,
          userInfo: {
            id: user.id,
            phone: user.phone,
            nickname: user.nickname,
            avatar: user.avatar,
            lastData: user.lastData || null,   // 返回上一次存储的数据
          },
        },
      });
    }

    // ---------- 微信手机号一键登录 ----------
    if (type === 'wechat_phone') {
      const { phoneCode, wxCode } = req.body;
      if (!phoneCode || !wxCode) {
        return res.status(400).json({ code: 400, message: '缺少必需参数' });
      }

      // 1. 通过 wx.login code 获取 openid
      const { openid } = await code2Session(wxCode);

      // 2. 通过 phoneCode 换取手机号
      const phone = await getPhoneNumberByCode(phoneCode);

      // 3. 查找或创建用户
      let user = await findUserByPhone(phone);
      if (!user) {
        user = await createUser({
          phone,
          openid,
          nickname: `手机用户${phone.slice(-4)}`, // 默认昵称
        });
      } else {
        // 更新 openid（若之前未关联）
        if (!user.openid) {
          await updateUserOpenid(user.id, openid);
          user.openid = openid;
        }
      }

      const token = generateToken({ userId: user.id, phone: user.phone });
      return res.json({
        code: 0,
        message: '登录成功',
        data: {
          token,
          userInfo: {
            id: user.id,
            phone: user.phone,
            nickname: user.nickname,
            avatar: user.avatar,
          },
        },
      });
    }

    return res.status(400).json({ code: 400, message: '不支持的登录类型' });
  } catch (error) {
    console.error('登录异常:', error);
    res.status(500).json({ code: 500, message: error.message || '服务器内部错误' });
  }
});

// 可选：密码注册接口（方便测试）
app.post('/api/register', async (req, res) => {
  try {
    const { phone, password, username } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ code: 400, message: '手机号和密码不能为空' });
    }

    const existing = await findUserByPhone(phone);
    if (existing) {
      return res.status(409).json({ code: 409, message: '手机号已注册' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      phone,
      username,
      passwordHash,
      nickname: username || `用户${phone.slice(-4)}`,
    });

    const token = generateToken({ userId: user.id, phone: user.phone });
    res.json({
      code: 0,
      message: '注册成功',
      data: {
        token,
        userInfo: { id: user.id, phone: user.phone, nickname: user.nickname },
      },
    });
  } catch (error) {
    console.error('注册异常:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});
// index.js 文件末尾（删除原有的两处 listen，改为以下代码）


const PORT = process.env.PORT || 3000;

// 先同步数据库，再启动服务
sequelize.sync({ alter: false })
  .then(() => {
    console.log('✅ 数据库表同步成功');
    app.listen(PORT, () => {
      console.log(`🚀 登录服务启动成功：http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ 数据库表同步失败:', err);
    process.exit(1);
  });