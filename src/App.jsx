import React, { useEffect, useMemo, useRef, useState } from "react";
import logo from "./logo.png";
import { motion } from "framer-motion";
import { Slider } from "./components/ui/slider";
import { Button } from "./components/ui/button";
import { Label } from "./components/ui/label";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

/**
 * Симулятор водяного тёплого пола (2D стационар)
 * Утеплитель всегда ниже трубы. Труба удерживается внутри стяжки.
 */

const PRESETS_SCREED = [
  { id: "wet", name: "Мокрая цементная", k: 0.80 },
  { id: "semi", name: "Полусухая", k: 0.46 },
  { id: "anhydrite", name: "Ангидритовая", k: 1.60 },
  { id: "high", name: "Бетон", k: 1.50 },
];

const PRESETS_COVER = [
  // Эффективные параметры с учётом типичных подслоёв
  { id: "tile", name: "Плитка 10 мм + клей 4 мм", t: 0.014, k: 1.10 },
  { id: "laminate8", name: "Ламинат 8 мм + подложка 2 мм", t: 0.010, k: 0.11 },
  { id: "wood20", name: "Дерево 20 мм", t: 0.020, k: 0.15 },
  { id: "vinyl5", name: "Винил 5 мм", t: 0.005, k: 0.25 },
  { id: "none", name: "Без покрытия (голая стяжка)", t: 0.0, k: 99.0 },
];

const PRESETS_INSULATION = [
  { id: "eps30", name: "EPS 30 мм", t: 0.03, k: 0.035 },
  { id: "eps50", name: "EPS 50 мм", t: 0.05, k: 0.035 },
  { id: "eps100", name: "EPS 100 мм", t: 0.10, k: 0.035 },
  { id: "xps50", name: "XPS 50 мм", t: 0.05, k: 0.030 },
  { id: "none", name: "Без утеплителя", t: 0.0, k: 1.0 },
];

// Подложка между стяжкой и утеплителем (эффективная прослойка)
const PRESETS_UNDERLAY = [
  { id: "none", name: "Нет подложки", type: "none", t: 0 },
  { id: "foil", name: "Фольга в контакте", type: "foil", t: 0 },
  { id: "bubble5", name: "Фольга с пузырьками 5 мм", type: "bubble", t: 0.005, eps: 0.05 },
  // Учебные варианты матов для крепления трубы (уменьшение контакта со стяжкой)
  { id: "mat50", name: "Мат под трубу (контакт 50%)", type: "mat", phi: 0.50 },
  { id: "mat33", name: "Мат под трубу (контакт 33%)", type: "mat", phi: 0.33 },
];

function useDebounce(value, delay) {
  const [v, setV] = useState(value);
  useEffect(()=>{ const id = setTimeout(()=> setV(value), delay || 200); return ()=> clearTimeout(id); }, [value, delay]);
  return v;
}

function fmt(val, d=3){
  const n = Number(val);
  if (!isFinite(n)) return String(val);
  const s = n.toFixed(d);
  const i = s.indexOf(".");
  if (i < 0) return s;
  let end = s.length - 1;
  while (end > i && s[end] === "0") end--;
  if (end === i) end--;
  return s.slice(0, end+1);
}

export default function App() {
  const [Tair, setTair] = useState(22);
  const [Ts, setTs] = useState(45);
  const [Tr, setTr] = useState(40);

  const [spacing, setSpacing] = useState(0.15);
  const [pipeOD, setPipeOD] = useState(0.016);
  // Расстояние трубы от утеплителя — убрано из UI; используем автоматическое размещение
  const [screedThk, setScreedThk] = useState(0.050);

  const [hTop, setHTop] = useState(10);
  const [belowT, setBelowT] = useState(18);
  const [airVel, setAirVel] = useState(0); // скорость воздуха у поверхности, м/с
  const [autoReturn, setAutoReturn] = useState(false); // авто-расчёт обратки при фикс. расходе
  const [flowLpm, setFlowLpm] = useState(1.5); // л/мин на контур
  const [nPipes] = useState(3);
  const [layout, setLayout] = useState('spiral'); // 'meander' | 'spiral'
  const [loopLength] = useState(80); // м (не используется при фиксированной площади)
  const [loopPosFrac, setLoopPosFrac] = useState(0.5); // позиция среза
  const [useFixedArea] = useState(true);
  const [areaM2] = useState(9); // м² по умолчанию
  const [pipeUseTsTr, setPipeUseTsTr] = useState(true);
  const [fixScale, setFixScale] = useState(false); // фиксировать цветовую шкалу

  const [screed, setScreed] = useState(PRESETS_SCREED[1]);
  const [cover, setCover] = useState(PRESETS_COVER[0]);
  const [insul, setInsul] = useState(PRESETS_INSULATION[2]);
  const [under, setUnder] = useState(PRESETS_UNDERLAY[0]);

  const airVelSmooth = useDebounce(airVel, 400);
  const [contrast, setContrast] = useState(1.6);
  const debounced = useDebounce({ Tair, Ts, Tr, spacing, pipeOD, screedThk, hTop, belowT, airVel: airVelSmooth, screed, cover, under, insul, nPipes, layout, loopLength, loopPosFrac, useFixedArea, areaM2, fixScale, autoReturn, flowLpm, contrast }, 150);

  const NX = 144;
  const NY = 72;

  const canvasRef = useRef(null);
  const [hover, setHover] = useState(null); // {x,y,T}
  const [isMobile, setIsMobile] = useState(false);
  const [showIso, setShowIso] = useState(true);
  const [isoStep, setIsoStep] = useState(0.5);

  useEffect(()=>{
    const checkMobile = () => {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
      const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
      const narrow = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;
      setIsMobile(uaMobile || narrow);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Унифицированный способ создавать канвас (OffscreenCanvas с запасным вариантом)
  function createCanvas(width, height){
    try {
      if (typeof OffscreenCanvas !== 'undefined'){
        return new OffscreenCanvas(width, height);
      }
    } catch {}
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    return c;
  }

  const results = useMemo(()=>{
    const { Tair, Ts, Tr, spacing, pipeOD, screedThk, hTop, belowT, airVel, screed, cover, under, insul, nPipes, layout, loopLength, loopPosFrac, useFixedArea, areaM2, fixScale, autoReturn, flowLpm, contrast } = debounced;
    const S = Math.max(0.08, Math.min(0.40, spacing));
    const D = Math.max(0.012, Math.min(0.020, pipeOD));
    const twm = 0.5 * (Ts + Tr);

    // Толщина стяжки задаётся без учёта покрытия; покрытие добавляется отдельно
    const tCover = cover.t;
    const tScreed = Math.max(screedThk, 0.02);
    // Подложка: эквивалентная теплопроводность для пузырьковой фольги (ISO 6946)
    let tUnder = 0, kUnder = 1;
    // Для UI пояснений
    let underInfo = { type: under?.type ?? 'none', tGap: 0, eps: under?.eps ?? null, Rair_base: 0, rad_factor: 1, Rgap: 0, kUnder: 1 };
    if (under.type === 'bubble' && under.t > 0){
      tUnder = under.t;
      const tGap = under.t;
      // Базовое R для невентилируемого горизонтального зазора при тепле вниз (ISO 6946 Annex B)
      const Rair_base = 0.11 * (tGap/0.01); // ~0.11 м²K/Вт на 10 мм
      // Усиление за счёт низкой эмиссии фольги (ε≈0.05): 1.5–1.7 (берём 1.6 как учебное среднее)
      const rad_factor = 1.6;
      const Rgap = Rair_base * rad_factor;
      kUnder = Math.max(0.002, tGap / Rgap);
      underInfo = { type: 'bubble', tGap, eps: under.eps ?? 0.05, Rair_base, rad_factor, Rgap, kUnder };
    } else if (under.type === 'foil'){
      tUnder = 0; // чистая фольга в контакте — нет воздушного зазора → R≈0
      kUnder = 1;
      underInfo = { type: 'foil', tGap: 0, eps: 0.05, Rair_base: 0, rad_factor: 1, Rgap: 0, kUnder };
    }

    const tIns = insul.t;
    const totalH = tCover + tScreed + tUnder + tIns;

    // Геометрия: автоматическое размещение трубы — лежит на подложке (если есть) или на утеплителе
    const yUnderTop = tCover + tScreed; // верх подложки
    const yInsulTop = tCover + tScreed + tUnder; // верх утеплителя
    const minCover = 0.02; // минимальное покрытие над трубой
    const limitByScreed = Math.max(0, tScreed - D);
    const limitByCover = Math.max(0, yInsulTop - minCover - D);
    const maxDBot = Math.max(0, Math.min(limitByScreed, limitByCover));
    const dBotUser = 0; // пользователь не задаёт
    const dBotRaw = Math.max(dBotUser, (under && under.type !== 'none') ? under.t || 0 : 0);
    const dBot = Math.min(dBotRaw, maxDBot);
    const pipeBottomY = yInsulTop - dBot; // чем больше dBot, тем выше низ трубы (в стяжке)
    const pipeCenterY = pipeBottomY - 0.5 * D;
    const pipeTopY = pipeCenterY - 0.5 * D;
    const W = Math.max(1, nPipes) * S;
    const pipeCenters = Array.from({ length: Math.max(1, nPipes) }, (_, k) => ({ x: (k + 0.5) * S, y: pipeCenterY }));

    // Адаптивная дискретизация по толщине с гарантированным числом ячеек на слой
    const baseNY = 80;
    const dyBase = totalH / Math.max(2, (baseNY - 1));
    const dyLimits = [dyBase];
    if (tCover > 0) dyLimits.push(tCover / 6);
    dyLimits.push(tScreed / 30);
    if (tUnder > 0) dyLimits.push(tUnder / 4);
    if (tIns > 0) dyLimits.push(tIns / 10);
    const dyTarget = Math.max(1e-5, Math.min(...dyLimits));
    const NY = Math.max(3, Math.min(300, Math.round(totalH / dyTarget) + 1));

    const dx = W / (NX - 1);
    const dy = totalH / (NY - 1);

    const kRow = new Float64Array(NY);
    for (let j=0; j<NY; j++){
      const y = j*dy;
      if (y <= tCover) kRow[j] = cover.t === 0 ? screed.k : cover.k;
      else if (y <= tCover + tScreed) kRow[j] = screed.k;
      else if (y <= tCover + tScreed + tUnder) kRow[j] = kUnder;
      else kRow[j] = insul.t > 0 ? insul.k : screed.k;
    }

    const T = new Float64Array(NX*NY);
    const idx = (i,j)=> j*NX + i;
    for (let j=0; j<NY; j++){
      const frac = 1 - j/(NY-1);
      const Tv = belowT * (1-frac) + Tair * frac;
      T.fill(Tv, j*NX, (j+1)*NX);
    }

    const pipeMask = new Uint8Array(NX*NY);
    const pipeLabel = new Int8Array(NX*NY); pipeLabel.fill(-1);
    const r = 0.5*D;
    for (let j=1; j<NY-1; j++){
      const y = j*dy;
      for (let i=1; i<NX-1; i++){
        const x = i*dx;
        for (let k=0; k<pipeCenters.length; k++){
          const pc = pipeCenters[k];
          if (Math.hypot(x - pc.x, y - pc.y) <= r){ pipeMask[idx(i,j)] = 1; pipeLabel[idx(i,j)] = k; break; }
        }
      }
    }

    const iters = 1200, omega = 1.85;
    // Эффективный коэффициент теплоотдачи сверху с учётом скорости воздуха (прирост конвекции)
    const hEff = hTop + 6.0 * Math.pow(Math.max(0, airVel), 0.6);

    function computePipeTemperatures(n, Ts, Tr, layout, Tair, L, x, S){
      if (n <= 1) return [0.5*(Ts+Tr)];
      // оценка коэффициента затухания по 1D-модели: Tr = Tair + (Ts-Tair) e^{-alpha L}
      const num = Math.max(1e-6, Ts - Tair);
      const den = Math.max(1e-6, Tr - Tair);
      const alpha = Math.max(1e-6, Math.log(num/den) / Math.max(1e-6, L));
      const Ts_x = Tair + (Ts - Tair) * Math.exp(-alpha * x);
      const Tr_x = Tair + (Ts - Tair) * Math.exp(-alpha * Math.max(0, L - x));
      // Шаг разницы пройденной длины между соседними ветвями в центре среза
      const deltaAdj = layout === 'spiral' ? 2.0 : 3.0; // м (как вы задали)
      if (layout === 'meander') {
        // Змейка: монотонный спад температуры вдоль петли (без чередования подача/обратка)
        const clamp = (v)=> Math.max(0, Math.min(L, v));
        const Ts_at = (s)=> Tair + (Ts - Tair) * Math.exp(-alpha * clamp(s));
        const left  = Ts_at(x - deltaAdj);
        const mid   = Ts_at(x);
        const right = Ts_at(x + deltaAdj);
        return [left, mid, right].slice(0, n);
      }
      // Спираль: аналогично — крайние ближе к подаче, средняя ближе к обратке
      const clamp = (v)=> Math.max(0, Math.min(L, v));
      const Ts_at = (s)=> Tair + (Ts - Tair) * Math.exp(-alpha * clamp(s));
      const Tr_at = (s)=> Tair + (Ts - Tair) * Math.exp(-alpha * clamp(L - s));
      const left = Ts_at(x - deltaAdj);
      const mid  = Tr_at(x);
      const right= Ts_at(x + deltaAdj);
      return [left, mid, right].slice(0, n);
    }
    const L_eff = Math.max(5, useFixedArea ? (Math.max(1e-3, areaM2) / Math.max(0.02, S)) : loopLength);
    const xPos = Math.max(0, Math.min(0.5, loopPosFrac)) * Math.max(1e-6, L_eff);
    const TpipeArr = computePipeTemperatures(pipeCenters.length, Ts, Tr, layout, Tair, L_eff, xPos, S);
    // debug scalars
    const alphaDbg = Math.max(1e-6, Math.log(Math.max(1e-6, (Ts - Tair)) / Math.max(1e-6, (Tr - Tair))) / Math.max(1e-6, L_eff));
    const TsLoc = Tair + (Ts - Tair) * Math.exp(-alphaDbg * xPos);
    const TrLoc = Tair + (Ts - Tair) * Math.exp(-alphaDbg * Math.max(0, L_eff - xPos));
    for (let it=0; it<iters; it++){
      for (let j=0; j<NY; j++){
        if (j===0){
          for (let i=0; i<NX; i++){
            if (pipeMask[idx(i,j)]) {
              const label = pipeLabel[idx(i,j)];
              const Tpipe = (label >= 0) ? TpipeArr[Math.max(0, Math.min(TpipeArr.length-1, label))] : twm;
              // Если выбран "мат": имитируем снижение контакта через робин на части периметра (упрощение)
              if (under.type === 'mat'){
                const phi = under.phi ?? 0.5; // доля контакта
                const kGap = 0.026, tGap = 0.001; // ~1 мм зазор
                const hGap = kGap / tGap; // около 26 W/m2K
                // смешиваем: T0 = w*Dirichlet + (1-w)*Robin(к воздуху Tair)
                const w = Math.max(0, Math.min(1, phi));
                const T1 = T[idx(i,j+1)]; const k = kRow[j];
                const Trob = ((k/dy)*T1 + hGap*Tair) / ((k/dy) + hGap);
                T[idx(i,j)] = w*Tpipe + (1-w)*Trob; continue;
              } else {
                T[idx(i,j)] = Tpipe; continue;
              }
            }
            // Robin BC: -k * dT/dy = h * (T0 - Tair)
            // Численно устойчивая форма (весовое среднее):
            // T0 = ( (k/dy)*T1 + h*Tair ) / ( (k/dy) + h )
            const k = kRow[j];
            const T1 = T[idx(i,j+1)];
            const T0 = ((k/dy)*T1 + hEff*Tair) / ((k/dy) + hEff);
            T[idx(i,j)] = T0;
          }
          // симметрия по бокам для угловых узлов
          T[idx(0,0)] = T[idx(1,0)];
          T[idx(NX-1,0)] = T[idx(NX-2,0)];
          continue;
        }
        if (j===NY-1){
          for (let i=0; i<NX; i++){
            if (pipeMask[idx(i,j)]) { T[idx(i,j)] = twm; continue; }
            T[idx(i,j)] = belowT;
          }
          continue;
        }

        for (let i=0; i<NX; i++){
          if (i===0){ T[idx(0,j)] = T[idx(1,j)]; continue; }
          if (i===NX-1){ T[idx(NX-1,j)] = T[idx(NX-2,j)]; continue; }
          if (pipeMask[idx(i,j)]){
            const label = pipeLabel[idx(i,j)];
            const Tpipe = (label >= 0) ? TpipeArr[Math.max(0, Math.min(TpipeArr.length-1, label))] : twm;
            if (under.type === 'mat'){
              const phi = under.phi ?? 0.5; const kGap=0.026, tGap=0.001; const hGap = kGap/tGap; const w=Math.max(0,Math.min(1,phi));
              const T1 = T[idx(i,j+1)]; const k = kRow[j];
              const Trob = ((k/dy)*T1 + hGap*Tair) / ((k/dy) + hGap);
              T[idx(i,j)] = w*Tpipe + (1-w)*Trob; continue;
            } else {
              T[idx(i,j)] = Tpipe; continue;
            }
          }

          const k = kRow[j], kU = kRow[j-1], kD = kRow[j+1];
          const kxL = k, kxR = k;
          const kyU = 2*k*kU/(k+kU), kyD = 2*k*kD/(k+kD);

          const tL = T[idx(i-1,j)], tR = T[idx(i+1,j)];
          const tU = T[idx(i,j-1)], tD = T[idx(i,j+1)];

          const Ax = kxL/(dx*dx) + kxR/(dx*dx);
          const Ay = kyU/(dy*dy) + kyD/(dy*dy);
          const b = (kxL*tL + kxR*tR)/(dx*dx) + (kyU*tU + kyD*tD)/(dy*dy);

          const Tnew = b/(Ax+Ay);
          const old = T[idx(i,j)];
          T[idx(i,j)] = old + omega*(Tnew - old);
        }
      }
    }

    const surfaceT = new Float64Array(NX);
    for (let i=0; i<NX; i++) surfaceT[i] = T[idx(i,0)];

    const qUpArr = new Float64Array(NX);
    let qUpSum = 0;
    for (let i=0; i<NX; i++){ const q = hEff*(surfaceT[i] - Tair); qUpArr[i]=q; qUpSum+=q; }
    const qUpMean = qUpSum / NX;

    let qDownSum = 0;
    for (let i=0; i<NX; i++){
      const kB = kRow[NY-1];
      const Tb = T[idx(i,NY-1)];
      const Tprev = T[idx(i,NY-2)];
      const q = -kB * (Tb - Tprev) / dy;
      qDownSum += q;
    }
    const qDownMean = qDownSum / NX; // положительно вниз
    const qDownAbs = Math.max(0, qDownMean);

    const qTotalPerArea = qUpMean + qDownAbs;
    const upShare = qUpMean / (qTotalPerArea + 1e-9);

    const profile = Array.from({ length: NX }, (_, i)=> ({ x: (i*dx).toFixed(3), T: +surfaceT[i].toFixed(2), q: +qUpArr[i].toFixed(1) }));

    // Комфорт и нормативы: доля поверхности выше порогов и локальный перепад ("босая стопа")
    let over29 = 0, over31 = 0;
    for (let i=0; i<NX; i++){ if (surfaceT[i] > 29) over29++; if (surfaceT[i] > 31) over31++; }
    const over29Pct = (over29 / NX) * 100;
    const over31Pct = (over31 / NX) * 100;
    const steps5 = Math.max(1, Math.round(0.05 / Math.max(1e-9, dx)));
    const steps10 = Math.max(1, Math.round(0.10 / Math.max(1e-9, dx)));
    let dFoot5 = 0, dFoot10 = 0;
    for (let i=0; i<NX; i++){
      const j5 = Math.min(NX-1, i + steps5);
      const j10 = Math.min(NX-1, i + steps10);
      dFoot5 = Math.max(dFoot5, Math.abs(surfaceT[j5] - surfaceT[i]));
      dFoot10 = Math.max(dFoot10, Math.abs(surfaceT[j10] - surfaceT[i]));
    }

    // Подбираем размер изображения так, чтобы соотношение сторон совпадало с физическим (W:totalH)
    const widthPx = 560;
    const heightPx = Math.max(240, Math.round(widthPx * (totalH / Math.max(1e-9, W))));
    const img = new ImageData(widthPx, heightPx);

    const Tmin = fixScale ? (Tair - 2) : Math.min(Tair, belowT) - 2;
    const Tmax = fixScale ? (Tair + 20) : Math.max(twm, Tair + 15);
    const clamp01 = (v)=> Math.min(1, Math.max(0, (v - Tmin) / (Tmax - Tmin + 1e-9)));
    const applyContrast = (u)=> {
      const c = Math.max(1, Math.min(3, contrast || 1));
      const out = 0.5 + (u - 0.5) * c;
      return Math.min(1, Math.max(0, out));
    };

    for (let yPix=0; yPix<heightPx; yPix++){
      const y = (yPix/(heightPx-1))*(NY-1);
      const j0 = Math.floor(y), j1 = Math.min(NY-1, j0+1), fy = y - j0;
      const yPhys = (yPix/(heightPx-1)) * totalH;
      for (let xPix=0; xPix<widthPx; xPix++){
        const x = (xPix/(widthPx-1))*(NX-1);
        const i0 = Math.floor(x), i1 = Math.min(NX-1, i0+1), fx = x - i0;
        const xPhys = (xPix/(widthPx-1)) * W;
        // Если пиксель попадает внутрь трубы — использовать температуру трубы
        let insidePipe = -1;
        for (let k=0; k<pipeCenters.length; k++){
          const pc = pipeCenters[k];
          if (Math.hypot(xPhys - pc.x, yPhys - pc.y) <= r){ insidePipe = k; break; }
        }
        let Tv;
        if (insidePipe >= 0){
          Tv = TpipeArr[Math.max(0, Math.min(TpipeArr.length-1, insidePipe))];
        } else {
        const T00 = T[idx(i0,j0)], T10 = T[idx(i1,j0)], T01 = T[idx(i0,j1)], T11 = T[idx(i1,j1)];
          Tv = (1-fx)*(1-fy)*T00 + fx*(1-fy)*T10 + (1-fx)*fy*T01 + fx*fy*T11;
        }
        // Визуально приглушаем нижнюю зону (утеплитель), чтобы не завышать впечатление от потока вниз
        if (yPhys >= yInsulTop) {
          const compress = 0.6; // 0…1, чем меньше — тем слабее контраст
          Tv = Tair - (Tair - Tv) * compress;
        }
        const c = colorMap(applyContrast(clamp01(Tv)));
        const p = 4*(yPix*widthPx + xPix);
        img.data[p+0] = c[0]; img.data[p+1] = c[1]; img.data[p+2] = c[2]; img.data[p+3] = 255;
      }
    }

    const overlays = { tCover, tScreed, tUnder, tIns, pipes: pipeCenters.map(p=>({ ...p, r })), S, W, totalH, pipeTopY, yUnderTop, yInsulTop, coverId: cover.id };

    let sumT = 0; for (let i=0; i<NX; i++) sumT += surfaceT[i];
    const Tavg = sumT / NX;
    const TmaxSurf = Math.max(...surfaceT);
    const TminSurf = Math.min(...surfaceT);
    const dTsurf = TmaxSurf - TminSurf;

    // 1D-оценка сопротивлений и потока
    const Rcover = tCover > 0 ? tCover/Math.max(cover.k,1e-3): 0;
    const Rscreed = tScreed/Math.max(screed.k,1e-3);
    const Runder = tUnder > 0 ? tUnder/Math.max(kUnder,1e-3): 0;
    const Rconv = 1/Math.max(hEff,1e-3);
    const Rsum = Rcover + Rscreed + Runder + Rconv;
    const TpipeEff = (TpipeArr[0] + TpipeArr[TpipeArr.length-1]) * 0.5; // грубая оценка
    const q1D = (TpipeEff - Tair)/Math.max(Rsum,1e-6);
    const Tsurf1D = Tair + q1D*Rconv;

    // Гидравлика: оценка обратки при фикс. расходе
    const rho = 998; // кг/м3
    const cp = 4180; // Дж/(кг·К)
    const mdot = Math.max(1e-6, (flowLpm/1000) / 60 * rho); // кг/с
    // Площадь плана петли: фиксированная (areaM2) или оценка S*L_eff
    const areaPlan = useFixedArea ? Math.max(1e-6, areaM2) : Math.max(1e-6, S * L_eff);
    // Для баланса энергии берём тепло, идущее ВВЕРХ в помещение
    const Qloop = qUpMean * areaPlan; // Вт (Дж/с)
    const Tr_auto = Ts - Qloop / Math.max(1e-6, (mdot*cp));

    // Нормативные пороги (учебные): СП 60.13330 (средняя для жилых ≤ 26 °C), DIN EN 1264 (максимальная для жилых ≤ 29 °C)
    const norms = { spAvgLimit: 29, dinMaxLimit: 29, exceedAvg: Tavg > 29, exceedMax: TmaxSurf > 29 };

    return {
      img, overlays, widthPx, heightPx, profile,
      metrics: {
        Tavg: +Tavg.toFixed(2), Tmax: +TmaxSurf.toFixed(2), Tmin: +TminSurf.toFixed(2), dTsurf: +dTsurf.toFixed(2),
        qUpMean: +qUpMean.toFixed(1), qDownMean: +qDownAbs.toFixed(1), upShare: +(upShare*100).toFixed(1),
        qTotal: +qTotalPerArea.toFixed(1),
          over29: +over29Pct.toFixed(1), over31: +over31Pct.toFixed(1),
          dFoot5: +dFoot5.toFixed(2), dFoot10: +dFoot10.toFixed(2)
      },
      metrics1D: {
        Rcover: +Rcover.toFixed(3), Rscreed: +Rscreed.toFixed(3), Runder: +Runder.toFixed(3), Rconv: +Rconv.toFixed(3),
        q1D: +q1D.toFixed(1), Tsurf1D: +Tsurf1D.toFixed(2)
      },
      grid: { S, W, totalH, dx, dy, NX, NY },
      debug: { alpha: alphaDbg, xPos, L: L_eff, TsLoc: TsLoc, TrLoc: TrLoc, pipeTemps: Array.from(TpipeArr) },
      field: { T },
      underInfo,
      hydraulics: { Tr_auto, mdot, Qloop },
      norms,
      flags: {}
    };
  }, [debounced]);

  useEffect(()=>{
    if (!results || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { img, overlays } = results;
    const { tCover, tScreed, tUnder, pipes, S, W, totalH, yUnderTop, yInsulTop, coverId } = overlays;

    // draw
    // Кросс-браузер отрисовка без ошибки OffscreenCanvas в средах, где его нет
    const off = createCanvas(img.width, img.height);
      const octx = off.getContext("2d");
    try { octx.putImageData(img, 0, 0); } catch {}
      canvasRef.current.width = img.width;
      canvasRef.current.height = img.height;
    try { ctx.drawImage(off, 0, 0); } catch { ctx.putImageData(img, 0, 0); }

    // overlays
    ctx.lineWidth = 2;
    ctx.setLineDash([6,6]);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    const yCover = (tCover/totalH) * img.height;
    const yScreed = ((tCover + tScreed)/totalH) * img.height;
    const yUnder = (yUnderTop/totalH) * img.height;
    const yIns = (yInsulTop/totalH) * img.height;
    if (tCover > 0){
      // декоративное отображение чистового покрытия в верхней зоне
      const makePattern = (type)=>{
        const tile = 24; const c = new OffscreenCanvas(tile, tile); const p = c.getContext('2d');
        p.clearRect(0,0,tile,tile);
        if (type==='tile'){
          p.fillStyle = '#e8e8e8'; p.fillRect(0,0,tile,tile);
          p.strokeStyle = 'rgba(0,0,0,0.25)'; p.lineWidth = 1; p.strokeRect(0.5,0.5,tile-1,tile-1);
        } else if (type==='laminate'){
          p.fillStyle = '#f0eadc'; p.fillRect(0,0,tile,tile);
          p.strokeStyle = 'rgba(120,85,40,0.25)'; p.lineWidth = 1; p.beginPath(); p.moveTo(tile*0.33,0); p.lineTo(tile*0.33,tile); p.moveTo(tile*0.66,0); p.lineTo(tile*0.66,tile); p.stroke();
        } else if (type==='wood20'){
          p.fillStyle = '#eadfcb'; p.fillRect(0,0,tile,tile);
          p.strokeStyle = 'rgba(120,90,50,0.25)'; p.lineWidth = 1; p.beginPath(); p.moveTo(0, tile*0.5); p.bezierCurveTo(tile*0.3, tile*0.3, tile*0.7, tile*0.7, tile, tile*0.5); p.stroke();
        } else if (type==='vinyl5'){
          p.fillStyle = '#f2f5f7'; p.fillRect(0,0,tile,tile);
          p.fillStyle = 'rgba(0,0,0,0.06)'; p.fillRect(tile*0.5-1,tile*0.5-1,2,2);
        } else { p.fillStyle = 'rgba(0,0,0,0)'; }
        return ctx.createPattern(c, 'repeat');
      };
      const mapId = (id)=> id==='tile' ? 'tile' : id==='laminate8' ? 'laminate' : id;
      const pat = makePattern(mapId(coverId));
      if (pat){ ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = pat; ctx.fillRect(0, 0, img.width, yCover); ctx.restore(); }

      ctx.beginPath(); ctx.moveTo(0, yCover); ctx.lineTo(img.width, yCover); ctx.stroke();
    }

    // Штриховка слоёв: стяжка (\\) — зона [yCover, yScreed], подложка (светлая сетка), утеплитель (/) — зона [yScreed, bottom]
    const screedHeight = Math.max(0, yScreed - yCover);
    if (screedHeight > 1){
      const tile = 12; const oc = new OffscreenCanvas(tile, tile); const pc = oc.getContext('2d');
      pc.clearRect(0,0,tile,tile);
      pc.strokeStyle = '#000000'; pc.lineWidth = 1;
      // диагонали \\
      pc.beginPath(); pc.moveTo(-tile,0); pc.lineTo(0,tile); pc.lineTo(tile*2,tile*3); pc.stroke();
      pc.beginPath(); pc.moveTo(0,0); pc.lineTo(tile,tile); pc.lineTo(tile*2,tile*2); pc.stroke();
      const patS = ctx.createPattern(oc,'repeat');
      if (patS){ ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.22; ctx.fillStyle = patS; ctx.fillRect(0, yCover, img.width, screedHeight); ctx.restore(); }
    }
    const insulHeight = Math.max(0, img.height - yIns);
    if (insulHeight > 1){
      const tile = 12; const oc = new OffscreenCanvas(tile, tile); const pc = oc.getContext('2d');
      pc.clearRect(0,0,tile,tile);
      pc.strokeStyle = '#000000'; pc.lineWidth = 1;
      // диагонали /
      pc.beginPath(); pc.moveTo(0,tile); pc.lineTo(tile,0); pc.lineTo(tile*2,-tile); pc.stroke();
      pc.beginPath(); pc.moveTo(-tile,tile); pc.lineTo(0,0); pc.lineTo(tile,-tile); pc.stroke();
      const patI = ctx.createPattern(oc,'repeat');
      if (patI){ ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.22; ctx.fillStyle = patI; ctx.fillRect(0, yIns, img.width, insulHeight); ctx.restore(); }
    }

    // Подложка — лёгкая сетка
    if (tUnder > 0){
      const height = Math.max(0, yIns - yUnder);
      if (height > 1){
        const tile = 8; const oc = new OffscreenCanvas(tile, tile); const pc = oc.getContext('2d');
        pc.clearRect(0,0,tile,tile);
        pc.strokeStyle = 'rgba(255,255,255,0.9)'; pc.lineWidth = 0.8;
        pc.beginPath();
        pc.moveTo(0,0); pc.lineTo(tile,0); pc.moveTo(0,tile*0.5); pc.lineTo(tile,tile*0.5); pc.moveTo(0,tile); pc.lineTo(tile,tile);
        pc.moveTo(0,0); pc.lineTo(0,tile); pc.moveTo(tile*0.5,0); pc.lineTo(tile*0.5,tile); pc.moveTo(tile,0); pc.lineTo(tile,tile);
        pc.stroke();
        const patU = ctx.createPattern(oc,'repeat');
        if (patU){ ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = patU; ctx.fillRect(0, yUnder, img.width, height); ctx.restore(); }
      }
    }

    // Подписи слоёв у линий
    ctx.save();
    ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.textAlign = 'left';
    // Покрытие — у верхней границы покрытия
    if (tCover > 0){ ctx.textBaseline = 'bottom'; ctx.fillText('Покрытие', 8, Math.max(10, yCover - 4)); }
    // Стяжка — у границы стяжки/подложки
    ctx.textBaseline = 'bottom'; ctx.fillText('Стяжка', 8, Math.max(10, yScreed - 4));
    // Подложка — подпись скрыта по просьбе пользователя
    // Утеплитель — ниже границы стяжки/утеплителя
    ctx.textBaseline = 'top'; ctx.fillText('Утеплитель', 8, Math.min(img.height - 10, yIns + 4));
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, yScreed); ctx.lineTo(img.width, yScreed); ctx.stroke();
    // пунктир верха утеплителя
    ctx.setLineDash([4,4]); ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.moveTo(0, yIns); ctx.lineTo(img.width, yIns); ctx.stroke();
    // сброс стиля линий
    ctx.setLineDash([]); ctx.strokeStyle = 'rgba(0,0,0,0.9)';

    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    for (const pipe of pipes){
      const xPipe = (pipe.x / W) * img.width;
    const yPipe = (pipe.y / totalH) * img.height;
      const rPix = (pipe.r / W) * img.width; // при согласованном aspect это = (r/totalH)*height
    ctx.beginPath(); ctx.arc(xPipe, yPipe, rPix, 0, Math.PI * 2); ctx.stroke();
    }

    // Изолинии температуры (полноценные, по всему полю) — marching squares по ячейкам
    if (showIso && results?.metrics){
      const Tmin = results.metrics.Tmin;
      const Tmax = results.metrics.Tmax;
      const step = Math.max(0.5, Math.min(5, isoStep || 1));
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      const T = results.field.T;
      for (let Tiso = Math.ceil(Tmin/step)*step; Tiso < Tmax; Tiso += step){
        for (let j=0; j<NY-1; j++){
          const y0 = (j/(NY-1))*img.height;
          const y1 = ((j+1)/(NY-1))*img.height;
          for (let i=0; i<NX-1; i++){
            const x0 = (i/(NX-1))*img.width;
            const x1 = ((i+1)/(NX-1))*img.width;
            const t00 = T[j*NX + i];
            const t10 = T[j*NX + (i+1)];
            const t01 = T[(j+1)*NX + i];
            const t11 = T[(j+1)*NX + (i+1)];
            const pts = [];
            const addEdge = (ta, tb, xa, ya, xb, yb) => {
              if ((Tiso-ta)*(Tiso-tb) <= 0 && Math.abs(tb-ta) > 1e-9){
                const f = (Tiso - ta)/(tb - ta);
                pts.push({ x: xa + f*(xb-xa), y: ya + f*(yb-ya) });
              }
            };
            addEdge(t00, t10, x0, y0, x1, y0); // верх
            addEdge(t10, t11, x1, y0, x1, y1); // право
            addEdge(t11, t01, x1, y1, x0, y1); // низ
            addEdge(t01, t00, x0, y1, x0, y0); // лево
            if (pts.length === 2){
              ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
            } else if (pts.length === 4){
              // двусмысленный случай — рисуем две диагональные линии
              ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(pts[2].x, pts[2].y); ctx.lineTo(pts[3].x, pts[3].y); ctx.stroke();
            }
          }
        }
      }
      ctx.restore();
    }
  }, [results]);

  // Авто-обновление обратки при включённом фиксированном расходе
  useEffect(()=>{
    if (!results?.hydraulics || !autoReturn) return;
    const calc = Math.max(0, Math.min(Ts, results.hydraulics.Tr_auto));
    if (Math.abs(calc - Tr) > 0.05) setTr(+calc.toFixed(2));
  }, [results?.hydraulics, autoReturn, Ts, Tr]);

  const profileData = results?.profile ?? [];

  function sampleTemperatureAtCanvas(clientX, clientY){
    if (!results || !canvasRef.current) return null;
    const { field, grid } = results;
    const { T } = field;
    const { NX, NY } = grid;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPx = clientX - rect.left;
    const yPx = clientY - rect.top;
    if (xPx < 0 || yPx < 0 || xPx > rect.width || yPx > rect.height) return null;
    const xf = (xPx / rect.width) * (NX - 1);
    const yf = (yPx / rect.height) * (NY - 1);
    const i0 = Math.max(0, Math.min(NX - 2, Math.floor(xf)));
    const j0 = Math.max(0, Math.min(NY - 2, Math.floor(yf)));
    const i1 = i0 + 1, j1 = j0 + 1;
    const fx = xf - i0, fy = yf - j0;
    const idx = (i,j)=> j*NX + i;
    const T00 = T[idx(i0,j0)], T10 = T[idx(i1,j0)], T01 = T[idx(i0,j1)], T11 = T[idx(i1,j1)];
    const Tv = (1-fx)*(1-fy)*T00 + fx*(1-fy)*T10 + (1-fx)*fy*T01 + fx*fy*T11;
    return { x: xPx, y: yPx, T: Tv };
  }

  function handleMouseMove(e){
    const s = sampleTemperatureAtCanvas(e.clientX, e.clientY);
    if (s) setHover(s); else setHover(null);
  }
  function handleMouseLeave(){ setHover(null); }

  return (
    <div className="w-full min-h-screen bg-white text-gray-900">
      {isMobile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white px-6 text-center">
          <div className="max-w-md">
            <div className="text-2xl font-semibold mb-3">Только для ПК</div>
            <p className="text-sm text-gray-700">Эта учебная симуляция оптимизирована для компьютеров и недоступна на мобильных устройствах. Откройте сайт на ПК или ноутбуке.</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="grid grid-cols-3 items-center">
          <img src={logo} alt="logo" className="h-[30px] w-auto object-contain select-none justify-self-start" />
          <motion.h1 initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}} transition={{duration:0.4}} className="justify-self-center text-2xl md:text-3xl font-semibold tracking-tight text-center whitespace-nowrap">
            Симуляция напольного отопления
        </motion.h1>
          <div className="justify-self-end flex items-center gap-2">
            <a
              href="https://t.me/galfdesign"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="text-[#24A1DE] hover:text-[#1b8dc6] transition-colors"
              title="Galf Design в Telegram"
            >
              <svg width="30" height="30" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="24" fill="#26A5E4" />
                <path fill="#ffffff" d="M37.6 14.3c.6-.26 1.15.34.93.97l-5.17 16.07c-.18.55-.82.81-1.32.53l-6.98-3.98-3.52 3.05c-.43.37-1.1.18-1.26-.37l-1.36-4.72-4.86-1.64c-.69-.23-.74-1.19-.07-1.47l22.61-8.44zM30.1 19.3l-9.29 7.33.23 3.19 1.52-2.08 7.54-8.44z"/>
              </svg>
            </a>
            <Button
              variant="outline"
              onClick={()=>{
                setTs(45); setTr(40); setTair(22);
                setSpacing(0.15); setPipeOD(0.016);
                setScreedThk(0.050);
                setScreed(PRESETS_SCREED[1]); setCover(PRESETS_COVER[0]); setInsul(PRESETS_INSULATION[2]); setUnder(PRESETS_UNDERLAY[0]);
                setHTop(10); setBelowT(18); setAirVel(0);
                setAutoReturn(false); setFlowLpm(1.5);
                setLayout('spiral');
              }}
              title="Сбросить параметры до значений по умолчанию"
            >
              Сбросить
            </Button>
          </div>
        </div>
        {/* subtitle removed by request */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-1 rounded-2xl border p-4 shadow-sm">
            <div className="text-sm font-medium mb-3">Температуры, °C</div>
            <div className="space-y-3">
              <SliderField label="Температура воздуха" min={10} max={30} step={0.5} value={Tair} onChange={setTair} />
              <SliderField label="Подача" min={25} max={55} step={0.5} value={Ts} onChange={setTs} />
              <SliderField label="Обратка" min={20} max={50} step={0.5} value={Tr} onChange={setTr} />
              <div className="text-xs text-gray-600">Средняя температура теплоносителя: <b>{fmt(0.5*(Ts+Tr),1)} °C</b></div>
              <div className="grid grid-cols-5 items-center gap-3">
                <div className="col-span-3 flex items-center gap-2">
                  <Label>Авто-обратка (фикс. расход)</Label>
                  <span className="relative group inline-block align-middle select-none" aria-label="Что такое авто-обратка?">
                    <svg width="14" height="14" viewBox="0 0 24 24" className="text-gray-400 group-hover:text-gray-700">
                      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.08" />
                      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <text x="12" y="16" textAnchor="middle" fontSize="12" fill="currentColor">i</text>
                    </svg>
                    <div className="absolute z-10 hidden group-hover:block left-1/2 -translate-x-1/2 mt-2 whitespace-normal rounded-md border bg-white px-4 py-3 text-base shadow w-[500px] text-left">
                      <div className="font-semibold mb-2">Авто-обратка (фиксированный расход) — принцип работы</div>
                      <p className="mb-2"><b>Определение.</b> В режиме «авто-обратка» насос контура работает с <b>постоянным расходом</b> теплоносителя, а температура <b>подачи</b> фиксирована. Температура <b>обратки</b> меняется в зависимости от того, сколько тепла этот участок пола отдаёт помещению.</p>
                      <div className="mb-2"><b>Примечание симуляции.</b> В этой модели расчёт выполняется для <b>площади петли 9 м²</b>. Эффективная <b>длина трубы</b> автоматически меняется в зависимости от выбранного <b>шага укладки</b>.</div>
                      <div className="font-semibold mb-1">1. Логика процесса</div>
                      <ul className="list-disc pl-5 space-y-1 mb-2">
                        <li>Малые теплопотери помещения → вода в трубах остывает <b>мало</b> → обратка <b>выше</b>, ΔT <b>меньше</b>.</li>
                        <li>Большие теплопотери помещения → вода в трубах остывает <b>сильнее</b> → обратка <b>ниже</b>, ΔT <b>больше</b>.</li>
                        <li><b>Перегрев.</b> Если помещение уже прогрето, то при фиксированных подаче и расходе теплоноситель отдаёт меньше тепла — ΔT естественно <b>снижается</b>.</li>
                      </ul>
                      <div className="font-semibold mb-1">2. Математическая модель</div>
                      <p className="mb-2">Температура обратки вычисляется по формуле: <b>Tr = Ts − Qloop / (ṁ · cₚ)</b></p>
                      <div className="mb-2">где:</div>
                      <ul className="list-disc pl-5 space-y-1 mb-2">
                        <li><b>Ts</b> — температура подачи, °C;</li>
                        <li><b>Qloop</b> — тепловая мощность, отдаваемая участком пола в помещение, Вт;</li>
                        <li><b>ṁ</b> — массовый расход, кг/с (задаётся параметром «Расход, л/мин»);</li>
                        <li><b>cₚ</b> — удельная теплоёмкость воды, ≈ 4.18 кДж/(кг·°C).</li>
                      </ul>
                      <p>Если режим «авто-обратка» отключён, температуру обратки вы задаёте вручную.</p>
                    </div>
                  </span>
                </div>
                <input className="col-span-2 justify-self-end" type="checkbox" checked={autoReturn} onChange={(e)=> setAutoReturn(e.target.checked)} />
              </div>
              {(()=>{ const val = +flowLpm.toFixed(2); return (
                <SliderField
                  label="Расход контура, л/мин"
                  min={0.5}
                  max={6}
                  step={0.1}
                  value={val}
                  onChange={(x)=> setFlowLpm(x)}
                  disabled={!autoReturn}
                />
              )})()}
            </div>

            <div className="rounded-2xl border p-4 shadow-sm mt-4">
              <div className="text-sm font-medium mb-3">Геометрия</div>
              <div className="space-y-3">
                {(()=>{ const val = Math.round(spacing*1000); return (
                  <SliderField label="Шаг укладки, мм" min={50} max={300} step={10} value={val} onChange={(mm)=> setSpacing(mm/1000)} />
                )})()}
                {(()=>{ const val = Math.round(pipeOD*1000); return (
                  <SliderField label="Наружный диаметр трубы, мм" min={12} max={25} step={1} value={val} onChange={(mm)=> setPipeOD(mm/1000)} />
                )})()}
                {(()=>{ const val = Math.round(screedThk*1000); return (
                  <SliderField label="Толщина стяжки, мм" min={50} max={120} step={5} value={val} onChange={(mm)=> setScreedThk(mm/1000)} />
                )})()}
              </div>
            </div>

            <div className="rounded-2xl border p-4 shadow-sm mt-4">
              <div className="text-sm font-medium mb-3">Материалы</div>
              <div className="space-y-3">
                <SelectRow label="Покрытие" value={cover.id} onValueChange={(v)=> setCover(PRESETS_COVER.find(p=>p.id===v) || PRESETS_COVER[0])} items={PRESETS_COVER} render={(p)=> `${p.name}${p.t?` (k=${p.k})`:''}`} />
                <SelectRow label="Стяжка" value={screed.id} onValueChange={(v)=> setScreed(PRESETS_SCREED.find(p=>p.id===v) || PRESETS_SCREED[0])} items={PRESETS_SCREED} render={(p)=> `${p.name} (k=${p.k} W/m·K)`} />
                <SelectRow label="Подложка (между стяжкой и утеплителем)" value={under.id} onValueChange={(v)=> setUnder(PRESETS_UNDERLAY.find(p=>p.id===v) || PRESETS_UNDERLAY[0])} items={PRESETS_UNDERLAY} render={(p)=> p.name} />
                <SelectRow label="Утеплитель" value={insul.id} onValueChange={(v)=> setInsul(PRESETS_INSULATION.find(p=>p.id===v) || PRESETS_INSULATION[0])} items={PRESETS_INSULATION} render={(p)=> `${p.name}${p.t?` (k=${p.k})`:''}`} />
                {results?.underInfo && (
                  <div className="text-xs text-gray-700 border rounded-md p-2 bg-gray-50">
                    <div className="font-medium mb-1">Подложка — эквивалентное сопротивление (ISO 6946):</div>
                    {results.underInfo.type === 'foil' && (
                      <div>
                        Чистая фольга в контакте: нет воздушного зазора → R≈0 → влияния на теплопередачу нет.
                      </div>
                    )}
                    {results.underInfo.type === 'bubble' && (
                      <div>
                        Воздушный зазор t = {fmt(results.underInfo.tGap,3)} м: базовое Rₐᵢʳ ≈ {fmt(results.underInfo.Rair_base,3)} м²K/Вт. Низкая эмиссия фольги (ε≈{results.underInfo.eps}) даёт радиационный множитель ≈ {fmt(results.underInfo.rad_factor,2)} → Rᵍₐₚ ≈ {fmt(results.underInfo.Rgap,3)} м²K/Вт, эквивалентная k ≈ {fmt(results.underInfo.kUnder,3)} W/m·K. Поэтому эффект «фольга+пузырьки» минимальный.
                      </div>
                    )}
                    {results.underInfo.type === 'none' && (
                      <div>Подложка отсутствует.</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border p-4 shadow-sm mt-4">
              <div className="text-sm font-medium mb-3">Граничные условия</div>
              <div className="space-y-3">
                <SliderField label="Коэф. теплоотдачи сверху h, W/m²K" min={6} max={14} step={0.5} value={hTop} onChange={setHTop} />
                <SliderField label="Температура ниже утеплителя" min={5} max={22} step={0.5} value={belowT} onChange={setBelowT} />
                <SliderField label="Скорость воздуха у поверхности, м/с" min={0} max={1.0} step={0.05} value={airVel} onChange={setAirVel} />
                
              {/* Число труб фиксировано = 3 */}
              <div className="grid grid-cols-5 gap-3 items-center">
                <Label className="col-span-2">Схема укладки</Label>
                <select className="col-span-3 border rounded-md px-3 py-2 bg-white text-sm" value={layout} onChange={(e)=> setLayout(e.target.value)}>
                  <option value="meander">Змейка</option>
                  <option value="spiral">Спираль</option>
                </select>
              </div>
                {/* Позиция среза по длине петли [0..0.5] */}
                <SliderField
                  label="Позиция среза"
                  hint={"0 — у коллектора (в крайние трубы приходит подача/обратка), 0.5 — центр петли."}
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={loopPosFrac}
                  onChange={(v)=> setLoopPosFrac(v)}
                />
              </div>
              {/* скрытая кнопка сброса по просьбе пользователя */}
            </div>
          </div>

          <div className="lg:col-span-2 grid grid-cols-1 gap-6">
            <div className="rounded-2xl border p-4 shadow-sm">
              <div className="text-sm font-medium mb-3">Поле температур</div>
              <div className="rounded-2xl overflow-hidden border shadow-sm relative">
                <canvas ref={canvasRef} className="w-full h-auto block" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
                {hover && (
                  <div className="absolute pointer-events-none text-[11px] px-2 py-1 rounded-md bg-black/80 text-white shadow"
                       style={{ left: Math.min(Math.max(hover.x+8, 4), (canvasRef.current?.clientWidth||0)-80), top: Math.min(Math.max(hover.y+8, 4), (canvasRef.current?.clientHeight||0)-24) }}>
                    {`T = ${fmt(hover.T,2)} °C`}
                  </div>
                )}
                </div>
                <div className="flex flex-wrap items-center justify-end mt-2 gap-3 text-sm">
                  <Label>Фиксировать шкалу по T</Label>
                  <input type="checkbox" checked={fixScale} onChange={(e)=> setFixScale(e.target.checked)} />
                  <Label className="ml-4">Контраст</Label>
                  <input type="range" min={1} max={3} step={0.1} value={contrast} onChange={(e)=> setContrast(parseFloat(e.target.value))} className="w-40" />
                  <Label className="ml-4">Изолинии</Label>
                  <input type="checkbox" checked={showIso} onChange={(e)=> setShowIso(e.target.checked)} />
                </div>
                {/* примечание скрыто по просьбе пользователя */}
              </div>

            <div className="rounded-2xl border p-4 shadow-sm">
              <div className="text-sm font-medium mb-3">Результаты</div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <Metric label="Tпов ср" value={`${results?.metrics.Tavg} °C`} />
                <Metric label="Tпов мин/макс" value={`${results?.metrics.Tmin} / ${results?.metrics.Tmax} °C`} />
                <Metric label="ΔTпов (макс−мин)" value={`${results?.metrics.dTsurf} °C`} />
                <Metric label="q↑ средняя" value={`${results?.metrics.qUpMean} W/m²`} />
                <Metric label="q↓ средняя" value={`${results?.metrics.qDownMean} W/m²`} />
                <Metric label="Доля вверх" value={`${results?.metrics.upShare}%`} />
                <Metric label="q суммарная" value={`${results?.metrics.qTotal} W/m²`} />
              </div>
              {/* Блоки с >29/>31 и ΔT стопа скрыты по просьбе пользователя */}
              <div className="mt-3 text-xs">
                {results?.norms?.exceedAvg && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
                    Превышен норматив по средней температуре поверхности для жилых помещений (СП 60.13330):
                    Tпов ср = {results.metrics.Tavg} °C {">"} {results.norms.spAvgLimit} °C.
                  </div>
                )}
                {results?.norms?.exceedMax && (
                  <div className="rounded-md border border-red-300 bg-red-50 text-red-900 px-3 py-2 mt-2">
                    Превышен норматив по максимальной температуре поверхности (DIN EN 1264):
                    Tпов макс = {results.metrics.Tmax} °C {">"} {results.norms.dinMaxLimit} °C.
                  </div>
                )}
              </div>
              {/* debug info removed */}
            </div>

            <div className="rounded-2xl border p-4 shadow-sm">
              <div className="text-sm font-medium mb-3">Профиль поверхности</div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={profileData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                    <XAxis dataKey="x" tickFormatter={(v)=>`${(parseFloat(v)*1000|0)} мм`} interval={11} />
                    <YAxis yAxisId="left" domain={["auto","auto"]} label={{ value: "T, °C", angle: -90, position: "insideLeft" }} />
                    <YAxis yAxisId="right" orientation="right" domain={["auto","auto"]} label={{ value: "q↑, W/m²", angle: -90, position: "insideRight" }} />
                    <Tooltip formatter={(val, name)=> name==="T"? [`${val} °C`,`Tпов`] : [`${val} W/m²`,`q↑`]} labelFormatter={(v)=>`x = ${(parseFloat(v)*1000|0)} мм`} />
                    <Line isAnimationActive={false} yAxisId="left" type="monotone" dataKey="T" dot={false} strokeWidth={2} />
                    <Line isAnimationActive={false} yAxisId="right" type="monotone" dataKey="q" dot={false} strokeDasharray="6 4" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
                <div className="text-xs text-gray-600 mt-2">
                  Профиль температуры поверхности по одному шагу и локальная плотность теплового потока вверх.
                </div>
              </div>
            </div>

        </div>
      </div>
    </div>
  );
}

function SliderField({ label, min, max, step, value, onChange, hint, disabled }){
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label className={disabled ? 'opacity-50' : ''}>{label}</Label>
          {hint && (
            <span className="relative group inline-block align-middle select-none">
              <svg width="14" height="14" viewBox="0 0 24 24" className="text-gray-400 group-hover:text-gray-700">
                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.08" />
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <text x="12" y="16" textAnchor="middle" fontSize="12" fill="currentColor">i</text>
              </svg>
              <div className="absolute z-10 hidden group-hover:block left-1/2 -translate-x-1/2 mt-2 whitespace-pre rounded-md border bg-white px-3 py-2 text-xs shadow">
                {hint}
              </div>
            </span>
          )}
        </div>
        <span className="text-xs tabular-nums">{fmt(value,3)}</span>
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={(v)=> onChange(v[0])} disabled={disabled} />
    </div>
  );
}

function SelectRow({ label, value, onValueChange, items, render }){
  return (
    <div className="grid grid-cols-5 gap-3 items-center">
      <Label className="col-span-2">{label}</Label>
      <select
        className="col-span-3 border rounded-md px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900/40"
        value={value}
        onChange={(e)=> onValueChange(e.target.value)}
      >
          {items.map(it => (
          <option key={it.id} value={it.id}>{render(it)}</option>
          ))}
      </select>
    </div>
  );
}

function Metric({ label, value }){
  return (
    <div className="rounded-xl border p-3 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-base font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function colorMap(t){
  const stops = [
    { p: 0.0, c: [  0,  32, 128] },
    { p: 0.33, c:[  0, 180, 255] },
    { p: 0.66, c:[255, 230,   0] },
    { p: 1.0, c:[220,   0,   0] },
  ];
  for (let s=0; s<stops.length-1; s++){
    const a = stops[s], b = stops[s+1];
    if (t >= a.p && t <= b.p){
      const f = (t - a.p)/(b.p - a.p + 1e-9);
      return [
        Math.round(a.c[0] + f*(b.c[0]-a.c[0])),
        Math.round(a.c[1] + f*(b.c[1]-a.c[1])),
        Math.round(a.c[2] + f*(b.c[2]-a.c[2])),
      ];
    }
  }
  return stops[stops.length-1].c;
}
