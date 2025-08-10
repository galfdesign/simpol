# Underfloor Heating Simulator (Vite + React + Tailwind)

## Запуск
```bash
npm install
npm run dev
```
Откройте адрес, который покажет Vite (обычно http://localhost:5173).

## Сборка
```bash
npm run build
npm run preview
```

Зависимости: react, recharts (для графика), framer-motion (анимации), tailwindcss.

## Развёртывание на GitHub

1. Инициализируйте git, если ещё не инициализирован:
   ```bash
   git init
   git add .
   git commit -m "init"
   ```
2. Создайте репозиторий `simpol` у пользователя `galfdesign` и свяжите ремоут:
   ```bash
   gh repo create galfdesign/simpol --public --source . --remote origin --push
   ```
   Если `gh` не установлен/авторизован:
   - Создайте репозиторий вручную на github.com
   - Затем:
     ```bash
     git remote add origin https://github.com/galfdesign/simpol.git
     git branch -M main
     git push -u origin main
     ```
