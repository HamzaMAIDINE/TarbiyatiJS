# Tarbiyati · تربيتي (Node.js Edition)

منصة تعليمية تفاعلية باللغة العربية متخصصة في علوم التربية ومستجدات المنظومة التربوية مع تتبع دقيق لتقدم المتعلم.

---

## 🚀 التشغيل السريع (Quick Start)

### المتطلبات الأساسية
- **Node.js**: إصدار 22 LTS أو أحدث (راجع `.nvmrc`).
- **npm**: مدمج مع Node.js.

### خطوات التثبيت والتشغيل

1. **تثبيت الحزم البرمجية:**
   ```bash
   npm install
   ```

2. **إعداد ملف البيئة:**
   انسخ ملف النموذج `.env.example` إلى `.env`:
   ```bash
   cp .env.example .env
   ```
   *(قم بضبط إعدادات البريد ومفتاح المسؤول داخل ملف `.env`)*.

3. **تشغيل الخادم المحلي:**
   ```bash
   # وضع التشغيل العادي:
   npm start

   # أو وضع التطوير مع إعادة التحميل التلقائي:
   npm run dev
   ```

4. **افتح المتصفح على:**
   ```text
   http://localhost:3000
   ```

---

## 🛠️ الأوامر والمهام الشائعة (Commands)

| الأمر | الوظيفة |
|---|---|
| `npm start` | تشغيل الخادم على المنفذ المحدد في `.env` (الافتراضي: 3000). |
| `npm run dev` | تشغيل الخادم في وضع التطوير ومراقبة التغييرات. |
| `npm test` | تشغيل حزمة الاختبارات الآلية (68 اختباراً). |
| `npm run check` | التحقق من صحة الكتالوج، الروابط، وأمان الأصول. |
| `npm run sync:mobile` | مزامنة المحتوى التعليمي مع حزمة تطبيق الهاتف (Flutter). |
| `npm run email:check` | فحص اتصال البريد الإلكتروني (SMTP / Brevo API). |

---

## ⚙️ متغيرات البيئة (Environment Variables)

يمكن ضبط المتغيرات التالية داخل ملف `.env`:

```env
# المنفذ وعنوان الاستماع
PORT=3000
HOST=127.0.0.1
NODE_ENV=development

# عنوان الموقع في بيئة الإنتاج (HTTPS)
PUBLIC_ORIGIN=https://example.com

# البريد الإلكتروني للمسؤول
ADMIN_EMAIL=admin@example.com

# إعدادات إرسال البريد (Brevo HTTPS أو SMTP)
BREVO_API_KEY=your-brevo-api-key
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_KEY=your-smtp-key
SMTP_FROM=noreply@example.com
SMTP_FROM_NAME="Tarbiyati · تربيتي"
```

---

## 🐳 النشر باستخدام Docker (Production Deployment)

لبناء وتشغيل المنصة كحاوية Docker:

```bash
# بناء الحاوية:
docker build -t tarbiyati:latest .

# تشغيل الحاوية مع ربط التخزين الدائم لقاعدة البيانات:
docker run -d \
  --name tarbiyati \
  --restart unless-stopped \
  --env-file .env \
  -e NODE_ENV=production \
  -p 127.0.0.1:3000:3000 \
  -v tarbiyati-data:/var/lib/scienceedu \
  tarbiyati:latest
```

> **ملاحظة أمنية:** يُوصى دائماً بوضع الخادم خلف وكيل عكسي (Reverse Proxy مثل Nginx أو Caddy أو Cloudflare) لتوفير شهادة SSL/TLS وإدارة الترويسات الأمنية.
