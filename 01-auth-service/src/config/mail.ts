import nodemailer from 'nodemailer'

export const emailTransporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})
