# NELC Website — Nanyang English Language Centre

**A Bigger World Through English**  
Website for [https://nelcsingapore.github.io/nelc-website/](https://nelcsingapore.github.io/nelc-website/) — professional English language training in Singapore.

---

## Pages

| File | Page |
|------|------|
| `index.html` | Home 首页 |
| `about.html` | About Us 关于我们 |
| `courses.html` | Courses 课程 |
| `contact.html` | Contact 联系我们 |

---

## How to Deploy on GitHub Pages

1. Create a new repository on GitHub (e.g. `nelc-website`)
2. Upload all these files keeping the folder structure:
   ```
   index.html
   about.html
   courses.html
   contact.html
   assets/
     css/
       style.css
     js/
       main.js
   ```
3. Go to **Settings → Pages**
4. Under **Source**, select `main` branch → `/ (root)` → Save
5. Your site will be live at: `https://yourusername.github.io/nelc-website`

---

## Set Up the Contact Form (Formspree)

The contact form uses [Formspree](https://formspree.io) — free for up to 50 submissions/month.

1. Go to [formspree.io](https://formspree.io) and create a free account
2. Create a new form → copy your Form ID (looks like `xbjwkzpq`)
3. In `contact.html`, find this line:
   ```html
   <form id="contact-form" action="https://formspree.io/f/YOUR_FORM_ID"
   ```
4. Replace `YOUR_FORM_ID` with your actual Form ID
5. Form submissions will be sent directly to your email

---

## Custom Domain (Optional)

To use a custom domain like `nelc.com.sg`:

1. Buy the domain from a registrar (e.g. Namecheap, GoDaddy)
2. In GitHub Pages settings, enter your custom domain
3. At your domain registrar, add a CNAME record:
   - Name: `www`
   - Value: `yourusername.github.io`
4. Wait 24 hours for DNS to propagate

---

## Language Toggle

The site is fully bilingual (English / 中文). Users can switch languages using the EN/中文 button in the navigation. The language preference is saved in the browser so it persists across pages.

---

## Customisation Notes

- **Colours**: Edit CSS variables at the top of `assets/css/style.css`
- **Logo**: Replace "NELC" text with an image by editing the `.nav-logo` section in each HTML file
- **Testimonials**: Edit the testimonial cards in `index.html`
- **UEN number**: Search for `[Your UEN]` in the footer and replace with your actual UEN
