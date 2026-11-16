# Winner Cakes

Loja virtual e gestão interna da Winner Cakes (confeitaria artesanal em São Gonçalo e Niterói — toda semana tem Festival de Fatias).

- `apps/web`: site (Next.js, exportação estática) publicado no Cloudflare Pages. A página inicial é a loja pública; `/login` leva ao gestor.
- `apps/api`: API (FastAPI) publicada no Firebase Cloud Functions, com dados no Firestore.

## Publicar

- Site: cada `git push` na `main` publica no Cloudflare Pages.
- API: rode `PUBLICAR-API.bat` (na pasta do projeto em Documentos). Ele usa o `codigo.zip` mais recente.
- Firebase: projeto `winner-cakes` (`.firebaserc`). A API usa Cloud Functions, que exige o plano Blaze.
