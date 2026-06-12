# PLANO-DEV-TINY-PELOTON-V1.md
## Jogo web 3D de ciclismo em mini-planetas — estilo "Messenger" (abeto.co)

> **Como usar:** executa os prompts por ordem (P01 → P18), um de cada vez, numa sessão de Claude Code.
> Cada prompt é autocontido: cola primeiro o bloco `CONTEXTO GLOBAL` e depois o prompt.
> Faz commit no fim de cada prompt antes de avançar.

---

## 0. VISÃO DO JOGO

**Nome de trabalho:** `Tiny Peloton` (alternativas: `Gran Volta`, `Peloton Planet`)

**Elevator pitch:** Um jogo de browser gratuito onde pedalas livremente por três mini-planetas esféricos — Tour, Giro e Vuelta — encontras lendas do ciclismo (parodiadas) que te desafiam para corridas arcade, e colecionas camisolas, capacetes e bicicletas. A magia visual e a sensação "cozy + partilhável" do Messenger, com picos de adrenalina de corrida.

**Pilares de design:**
1. **Wonder primeiro** — o jogador deve querer tirar screenshot nos primeiros 30 segundos
2. **Pegar e jogar** — controlos arcade: acelerar, virar, boost. Zero tutorial necessário
3. **Rivais com personalidade** — caricaturas cómicas de ciclistas reais (nomes parodiados, sem likeness fiel → sem problemas de direitos de imagem)
4. **Coleção, não grind** — cada vitória dá algo visível (camisola, peça de bike)
5. **60fps em telemóvel médio** — mobile-first, performance é feature

**Decisões fechadas:**
| Decisão | Valor |
|---|---|
| Mundo | 3 mini-planetas (Tour amarelo, Giro rosa, Vuelta vermelho), progressão aberta |
| Gameplay | Arcade puro: velocidade + boost; drafting enche boost (fase 2) |
| Rivais | Ciclistas mundiais parodiados, NPCs no mundo que desafiam para corridas |
| Estilo | Cel-shaded vibrante + caricatura (toon shading, outlines, paleta saturada) |
| Plataforma | Mobile-first (touch) + desktop (teclado), browser, sem instalação |
| Multiplayer | v1 solo; arquitetura preparada para ghosts/realtime na v2 |
| Idioma | Inglês |
| Persistência | localStorage na v1; Supabase reservado para v2 (leaderboards/ghosts) |

**Stack técnica:**
- Vite + TypeScript (sem Next.js — jogo é client-only, build leve)
- Three.js + three-mesh-bvh (colisões eficientes)
- Zustand (estado do jogo) · GSAP (animações UI/câmara) · Howler.js (áudio)
- Deploy: Vercel (static) · PWA manifest para "instalar" no telemóvel
- Assets: low-poly criados em código/procedural na v1 (placeholder-friendly), substituíveis por GLB do Blender depois

**Roster de rivais (nomes paródia, sem usar nomes reais):**
| Rival | Inspiração | Planeta | Arquétipo |
|---|---|---|---|
| Taddy Pog | Pogačar | Tour | Boss final — bom em tudo |
| Jonas Windgaard | Vingegaard | Tour | Trepador glacial |
| Wout van Art | Van Aert | Tour | Motor diesel, pavé |
| Matt van der Pol | Van der Poel | Giro | Explosivo, gravel |
| Pippo Gunna | Ganna | Giro | Rolador/contrarrelógio |
| Remco Rocketpoel | Evenepoel | Vuelta | Ataques a longa distância |
| Primo Roglet | Roglič | Vuelta | Sprint em rampa |
| João Almighty | João Almeida | Vuelta | Regularidade (toque PT 🇵🇹) |
| Marc Cannondish | Cavendish | Tour | Sprinter puro |
| Lotta Kopecki | Kopecky | Giro | All-rounder |

---

## CONTEXTO GLOBAL (colar no início de CADA prompt)

```
PROJETO: Tiny Peloton — jogo web 3D de ciclismo em mini-planetas esféricos, estilo "Messenger" (messenger.abeto.co).
STACK: Vite + TypeScript + Three.js + three-mesh-bvh + Zustand + GSAP + Howler. Deploy Vercel. Sem framework de UI — HTML/CSS vanilla para menus.
ESTRUTURA: src/core (engine: loop, input, física esférica), src/world (planetas, props), src/entities (player, rivais), src/race (sistema de corrida), src/ui (HUD, menus), src/state (Zustand stores), src/audio, src/assets.
CONVENÇÕES: TypeScript strict; classes para entidades, funções puras para utils; nada de any; constantes de gameplay num único ficheiro src/core/config.ts para tuning fácil; todos os vetores temporários reutilizados (pooling) — zero alocação no game loop; target 60fps em telemóvel médio.
FÍSICA ESFÉRICA: gravidade aponta para o centro do planeta; o "up" do jogador é a normal da superfície (posição normalizada); orientação por quaternions, nunca Euler; movimento tangente à esfera.
ESTILO VISUAL: cel-shading (MeshToonMaterial ou shader custom com 3 bandas), outlines por inverted hull ou postprocess, paleta saturada por planeta (Tour: amarelo/verde alpino; Giro: rosa/terracota; Vuelta: vermelho/ocre árido), céu gradiente com sol estilizado.
IDIOMA DO JOGO: inglês. CÓDIGO E COMENTÁRIOS: inglês.
NÃO usar: localStorage fora de src/state/save.ts; bibliotecas além das listadas sem justificar; assets externos com copyright.
```

---

## FASE 0 — FUNDAÇÃO

### P01 — Scaffold do projeto
```
[CONTEXTO GLOBAL]

Cria o projeto de raiz:
1. Vite + TypeScript vanilla. Instala: three, three-mesh-bvh, zustand, gsap, howler, @types/three.
2. Estrutura de pastas conforme convenções, com index.html (canvas fullscreen, viewport mobile correto, sem scroll/zoom, theme-color), main.ts e um Game loop em src/core/game.ts (requestAnimationFrame, delta time com clamp a 50ms, update/render separados).
3. src/core/config.ts com objeto CONFIG exportado (vazio por agora, será o painel de tuning).
4. Cena mínima de prova: esfera (raio 40) com MeshToonMaterial, luz direcional + hemisférica, cubo a orbitar para validar o loop.
5. Scripts: dev, build, preview. README curto com comandos.
CRITÉRIOS DE ACEITAÇÃO: `npm run dev` mostra a esfera a 60fps; sem erros TS; canvas ocupa 100% do ecrã em mobile e desktop sem barras de scroll.
```

### P02 — Física esférica + character controller
```
[CONTEXTO GLOBAL]

Implementa o núcleo do movimento na esfera em src/core/spherical.ts e src/entities/player.ts:
1. Funções utilitárias: surfaceNormal(pos, center), projectOnTangentPlane(vec, normal), orientToSurface(quaternion, normal, forward) — todas sem alocações (recebem targets).
2. Player: capsula placeholder (depois será o ciclista), estado {position, velocity, heading, speed}. Gravidade para o centro; "snap" suave à superfície via raycast (three-mesh-bvh) contra a mesh do planeta — suporta relevo, não só esfera perfeita.
3. Movimento: acelerar para a frente no plano tangente, virar roda o heading em torno da normal. Velocidade máxima, aceleração e atrito vêm de CONFIG.
4. O player deve poder dar a volta completa ao planeta sem flips de orientação (cuidado com singularidades de quaternion).
CRITÉRIOS: andar 3 voltas completas ao planeta em qualquer direção sem glitches; subir/descer relevo de teste (adiciona 2-3 montes deformando a esfera com noise simples).
```

### P03 — Câmara + controlos mobile/desktop
```
[CONTEXTO GLOBAL]

1. Câmara follow third-person em src/core/camera.ts: atrás e acima do player, alinhada com o "up" local (normal da esfera), com lag suave (damping) e FOV que aumenta com a velocidade (sensação de speed). O horizonte curvo do mini-planeta deve ser sempre visível — é o shot de marketing.
2. Input unificado em src/core/input.ts:
   - Desktop: WASD/setas (acelerar/travar/virar), SHIFT ou ESPAÇO = boost.
   - Mobile: acelerador automático (o jogador pedala sempre), virar com joystick virtual esquerdo OU inclinar arrastando em qualquer ponto do ecrã (escolhe a opção mais simples e robusta), botão de boost à direita (zona de toque grande, 96px+).
   - Camada de abstração: o jogo lê só {throttle, steer, boost} normalizados.
3. UI touch: elementos HTML sobrepostos, escondidos em desktop, com pointer-events corretos.
CRITÉRIOS: jogável em Chrome Android/iOS Safari via rede local; virar é suave e previsível; nenhuma página faz scroll/zoom acidental.
```

---

## FASE 1 — BIKE FEEL + VISUAL

### P04 — Bike feel arcade: boost, lean, juice
```
[CONTEXTO GLOBAL]

Transforma o movimento em algo delicioso:
1. Modelo de bike low-poly procedural (BufferGeometry composta: rodas, quadro, ciclista simplificado com cabeça grande estilo caricatura). Rodas giram com a velocidade; pedalada animada.
2. Lean: inclinar bike+ciclista nas curvas proporcional a steer*speed; pequeno wheelie ao iniciar boost.
3. Boost: barra que enche lentamente ao pedalar e instantaneamente ao apanhar "musettes" (sacos de comida flutuantes no mundo — coletáveis). Boost = +60% velocidade durante 1.5s, FOV kick, speed lines (shader fullscreen ou partículas), trail atrás da roda.
4. Feedback: partículas de poeira nas curvas fortes, squash/stretch subtil, screen shake leve ao ativar boost.
5. Tudo parametrizado em CONFIG (maxSpeed, boostMultiplier, leanAngle, etc.).
CRITÉRIOS: só andar às voltas no planeta vazio já é divertido ("toy test"); 60fps mantidos em mobile.
```

### P05 — Pipeline visual cel-shaded
```
[CONTEXTO GLOBAL]

1. Toon shading consistente: 3 bandas de luz, outlines (inverted hull nos objetos principais), sombras suaves.
2. Céu: gradiente vertical em shader (ou esfera invertida), sol estilizado disco branco, 2-3 nuvens low-poly a flutuar.
3. Paleta do planeta Tour como primeira implementação: relva verde-saturada, estradas cinza-azulado claro, acentos amarelo Tour.
4. Postprocess leve: vignette subtil + bloom barato (avaliar custo mobile; se pesado, desligar em mobile via deteção).
5. Sistema de qualidade: QualityManager com tiers (low/medium/high) por deteção de GPU/resolução — afeta pixel ratio, sombras, postprocess.
CRITÉRIOS: screenshot do jogo parado já parece um jogo acabado; comparar lado a lado com referência do Messenger; 60fps mobile em tier low/medium.
```

---

## FASE 2 — PLANETA TOUR

### P06 — Terreno e biomas do planeta Tour
```
[CONTEXTO GLOBAL]

Constrói o planeta Tour (raio ~60) com 4 zonas distintas distribuídas pela esfera:
1. ALPE — montanha alta com estrada em hairpins (a subida icónica), neve no topo.
2. PAVÉ — setor de calçada entre campos, árvores em fila (vibração visual da bike ao passar: shake subtil).
3. CAMPOS DE GIRASSÓIS — planície amarela, moinho, é a zona "postal de França".
4. VILA — meia dúzia de casas low-poly, café com esplanada, fonte, meta de chegada com arco.
Implementação: esfera base deformada por heightmap procedural (noise + máscaras por zona); estrada principal que liga as 4 zonas como spline fechada na esfera (gera ribbon mesh da estrada sobre o terreno — esta spline será reutilizada pelas corridas e pela AI); BVH atualizado para colisões.
CRITÉRIOS: dar a volta ao planeta pela estrada demora 60-90s a velocidade normal; cada zona é reconhecível à distância; transições de bioma suaves.
```

### P07 — Set dressing + coletáveis
```
[CONTEXTO GLOBAL]

1. Sistema de props com InstancedMesh: árvores (2-3 variantes), flores, pedras, postes km, bandeirolas, fardos de palha nas curvas. Spawning procedural por zona com seed fixa + exclusão da estrada.
2. Musettes coletáveis (P04) espalhadas: flutuam, rodam, brilham; apanhar enche boost + som + partículas.
3. 3 easter eggs escondidos (tradição do Messenger): p.ex. uma cabra no topo do Alpe, um OVNI que passa de noite... à tua escolha, documenta-os num comentário.
4. Pequenos NPCs espectadores estáticos junto à estrada na zona da vila (formas simples, aplaudem com animação de 2 frames).
CRITÉRIOS: densidade visual alta sem cair de 60fps (medir com stats); planeta sente-se vivo e explorável.
```

### P08 — Rivais no mundo: encontro e desafio
```
[CONTEXTO GLOBAL]

1. Define o roster em src/entities/rivals.ts como data: id, nome, planeta, zona, paleta de cores, personalidade (1 linha de bio), stats {topSpeed, accel, boostUse}, taunt e frase de derrota. Usa o roster do plano (Taddy Pog, Jonas Windgaard, Wout van Art, Marc Cannondish no Tour).
2. Modelo do rival = variação do modelo do player com cores/capacete próprios e proporções caricaturais (Taddy Pog: sorriso enorme; Windgaard: magérrimo e pálido — define por escala de partes).
3. Rivais aparecem na sua zona, em idle (a alongar, a beber bidão — animações simples em loop).
4. Aproximação do player → balão de exclamação; entrar no raio → painel de desafio (UI HTML estilizada): retrato, nome, bio, recorde do jogador, botões RACE / LATER.
CRITÉRIOS: encontrar e falar com os 4 rivais do Tour funciona; cada rival é visualmente distinto e cómico.
```

---

## FASE 3 — CORRIDAS

### P09 — Sistema de corrida
```
[CONTEXTO GLOBAL]

1. RaceManager (estado: idle → countdown → racing → finished) em src/race/.
2. Cada rival tem uma rota: troço da spline da estrada (P06) com início/fim; gates de checkpoint visíveis (arcos com bandeirolas) gerados ao longo da rota.
3. Fluxo: aceitar desafio → cutscene curta de câmara (GSAP) a mostrar o percurso → grid de partida → countdown 3-2-1 com sons → corrida → meta com faixa.
4. HUD de corrida: posição (1st/2nd), tempo, mini-barra de progresso do percurso, boost.
5. Falhar um checkpoint → reset suave para o último gate.
6. Tipos de corrida por arquétipo do rival: SPRINT (curta, plana — Cannondish), CLIMB (subida ao Alpe — Windgaard), CLASSIC (volta completa com pavé — van Art), BOSS (tudo — Taddy Pog, desbloqueia ao vencer os outros 3 do planeta).
CRITÉRIOS: corrida completa contra um rival dummy (segue a spline a velocidade constante) funciona de ponta a ponta com vitória e derrota.
```

### P10 — AI dos rivais + dificuldade
```
[CONTEXTO GLOBAL]

1. RivalAI: segue a spline da rota com offset lateral natural, usa boost nos momentos certos do seu arquétipo (sprinter guarda para o fim; trepador ataca na subida), velocidade base dos stats.
2. Rubber-banding honesto: se o jogador está muito atrás, o rival abranda até 8%; se está à frente, o rival esforça-se até +5% — nunca o suficiente para parecer batota. Parâmetros em CONFIG.
3. Dificuldade progressiva: 1ª corrida contra cada rival é vencível por principiante; vencer dá nova opção "REMATCH (harder)" com stats +10% e melhor recompensa.
4. Personalidade visível: taunts em speech bubbles durante a corrida (ao ultrapassar, ao ser ultrapassado).
CRITÉRIOS: playtest — principiante vence a 1ª corrida do Cannondish em 1-3 tentativas; corridas têm momentos de tensão (rival perto) na maioria das runs.
```

### P11 — Resultados, recompensas e camisolas
```
[CONTEXTO GLOBAL]

1. Ecrã de resultados: tempo, melhor pessoal, posição, recompensas com animação de unlock (GSAP).
2. Recompensas data-driven em src/race/rewards.ts: vencer rival → peça cosmética dele (capacete, óculos, quadro de bike na sua paleta); vencer todos os rivais normais de um planeta → desbloqueia o BOSS; vencer o boss → CAMISOLA do planeta (amarela/rosa/vermelha) — o troféu máximo, vestível.
3. Coleção: estrutura de dados de inventário (ids de itens possuídos + equipados) no Zustand store.
4. Derrota: mensagem encorajadora do rival + retry imediato (1 toque).
CRITÉRIOS: loop completo Tour: desafiar → vencer 3 rivais → boss aparece → vencer → camisola amarela no inventário.
```

---

## FASE 4 — PROGRESSÃO E COSMÉTICOS

### P12 — Save system + persistência
```
[CONTEXTO GLOBAL]

1. src/state/save.ts: único ponto de acesso a localStorage. Serializa: inventário, equipados, recordes por corrida, rivais vencidos, easter eggs encontrados, settings (volume, qualidade). Versionamento de schema (migrações futuras).
2. Auto-save em eventos (fim de corrida, equipar item, settings) com debounce.
3. Botão "Reset progress" nas settings com confirmação dupla.
4. Preparação v2: a estrutura de save deve ser serializável para Supabase mais tarde (ids estáveis, sem referências a objetos Three).
CRITÉRIOS: fechar e reabrir o browser preserva tudo; save corrompido não rebenta o jogo (fallback para novo save).
```

### P13 — Garagem: customização do ciclista e bike
```
[CONTEXTO GLOBAL]

1. Ecrã GARAGE acessível do menu e do mundo (ícone): ciclista em pódio rotativo, luz bonita.
2. Categorias: JERSEY (camisolas — incl. as 3 grandes), HELMET, GLASSES, BIKE FRAME, WHEELS. Cada item tem raridade (common/rare/legendary) e origem (rival vencido).
3. Swap em tempo real no modelo com preview; itens bloqueados visíveis em silhueta com hint de como desbloquear ("Beat Wout van Art").
4. O equipamento reflete-se no mundo e nas corridas.
5. UI touch-friendly: tabs grandes, swipe entre itens.
CRITÉRIOS: equipar camisola amarela + capacete do Pog e vê-los em jogo; tudo persiste (P12).
```

---

## FASE 5 — GIRO, VUELTA E HUB

### P14 — Planeta Giro
```
[CONTEXTO GLOBAL]

Reutiliza o pipeline do P06-P08 (refatora para PlanetBuilder data-driven se ainda não estiver):
Zonas: DOLOMITAS (picos dramáticos cinza-rosa), STRADE BIANCHE (gravel branco entre ciprestes), COSTA (mar, vespas estacionadas, gelataria), PIAZZA (vila italiana, campanário, meta).
Paleta rosa/terracota. Rivais: Matt van der Pol (gravel), Pippo Gunna (sprint na costa plana), Lotta Kopecki (clássica) + BOSS à escolha do roster ou van der Pol promovido a boss com os outros 2 + 1 novo.
Coletáveis e 3 easter eggs próprios (p.ex. uma vespa que foge, gelado gigante).
CRITÉRIOS: planeta Giro completo e jogável com o mesmo loop do Tour; código de planetas é data-driven (criar a Vuelta deve ser sobretudo dados).
```

### P15 — Planeta Vuelta
```
[CONTEXTO GLOBAL]

Zonas: DESERTO (ocres, arribas), RAMPA IMPOSSÍVEL (muro a 20%+ estilo Angliru — mecânica especial: gerir boost para não "explodir"), POVOADO BRANCO (Andaluzia, laranjeiras), PRAIA (meta junto ao mar).
Paleta vermelho/ocre, luz quente de fim de tarde. Rivais: Remco Rocketpoel (longa distância), Primo Roglet (sprint em rampa), João Almighty (regularidade — easter egg de bandeira PT escondida) + Taddy Pog como super-boss final do jogo se as 3 camisolas... não: boss da Vuelta é Roglet; ao ter as 3 camisolas, desbloqueia THE TRIPLE — corrida final contra Taddy Pog através dos 3 planetas? Não — v1: corrida épica no Tour com rota estendida. Implementa como descrito.
CRITÉRIOS: Vuelta completa; THE TRIPLE desbloqueia com as 3 camisolas e tem ecrã de campeão final (confetti, créditos).
```

### P16 — Hub espacial e navegação entre planetas
```
[CONTEXTO GLOBAL]

1. Vista de seleção: câmara afasta-se para o espaço, os 3 planetas em órbita (estilizados, com anéis da cor da sua camisola), estrelas, swipe/setas para escolher, mostra progresso por planeta (rivais vencidos X/4, camisola ✓).
2. Transição cinematográfica de "aterragem" no planeta (GSAP) — sem loading screens visíveis se possível (preload do planeta seguinte em background).
3. Memória de posição: voltar a um planeta repõe o jogador onde estava.
4. Gestão de memória: descarregar planeta anterior (dispose de geometrias/texturas) — verificar com memory profiler.
CRITÉRIOS: alternar entre os 3 planetas sem reload da página, sem leaks de memória, transições bonitas.
```

---

## FASE 6 — POLISH E LANÇAMENTO

### P17 — Áudio + onboarding + menus
```
[CONTEXTO GLOBAL]

1. Áudio (Howler): música lo-fi de exploração por planeta + tema energético de corrida (usa placeholders livres de direitos ou geramos depois — estrutura os hooks), SFX: pedalada/vento proporcional à velocidade, boost, coletável, checkpoint, vitória, UI. Crossfades entre estados. Mute persistente.
2. Title screen estilo Messenger: o planeta Tour a rodar ao fundo, logo, BEGIN. Primeiro jogo: 3 hints contextuais não-modais (mover, boost, "find a rival").
3. Menu de pausa + settings (volume música/SFX, qualidade gráfica, reset).
4. Acessibilidade básica: botões ≥44px, contraste de texto, opção de reduzir screen shake.
CRITÉRIOS: novo jogador entende o jogo sem ler nada; áudio nunca toca antes de interação do utilizador (política dos browsers).
```

### P18 — Performance final, PWA e deploy
```
[CONTEXTO GLOBAL]

1. Passe de performance: draw calls (target <150), texture atlas onde possível, verificação de pooling no loop, teste em telemóvel Android médio e iPhone — 60fps em medium.
2. PWA: manifest (ícone, nome, fullscreen, orientação landscape preferida mas suportar portrait), service worker simples para cache de assets (jogo funciona offline após 1ª visita).
3. Meta tags sociais (OG image = screenshot do planeta com o horizonte curvo), título, descrição: "Three tiny planets. Ten legendary rivals. One bike." 
4. Deploy: Vercel (vite build estático), domínio, verificação Lighthouse (performance >85 mobile).
5. README final com arquitetura, como adicionar um planeta/rival (guia data-driven), e roadmap v2: multiplayer ghosts via Supabase, leaderboards, drafting como mecânica de boost, daily challenges.
CRITÉRIOS: URL pública jogável, instalável como PWA, partilhável com preview bonito no WhatsApp/X.
```

---

## ROADMAP V2 (fora deste plano)
- **Ghosts assíncronos** (Supabase): gravar replays comprimidos dos melhores tempos, correr contra ghosts de outros jogadores
- **Leaderboards** por corrida (Supabase + anti-cheat básico por validação de física)
- **Drafting**: colar à roda do rival enche boost mais depressa (já desenhado, só ativar)
- **Multiplayer realtime** estilo Messenger (WebSocket, ver outros jogadores a explorar + emotes)
- **Daily challenge**: rota gerada por seed do dia, leaderboard de 24h
- **Eventos**: planeta Paris-Roubaix temporário, modo The Roam 🚴

---

## ORDEM DE RISCO (o que validar primeiro)
1. **P02-P04** são o coração: se a física esférica + bike feel não forem deliciosos, nada do resto salva o jogo. Investe tempo em tuning aqui.
2. **P05** decide se o jogo é partilhável. Compara sempre com o Messenger.
3. **P10** (AI) é onde a diversão das corridas vive ou morre — playtesta com pessoas reais.
