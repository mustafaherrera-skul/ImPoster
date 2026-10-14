# El Impostor

Juego de mesa para un solo teléfono. Los inocentes ven la palabra. El impostor solo recibe una pista.

## Cómo publicarlo en GitHub Pages

1. Creá un repositorio vacío en GitHub.
2. Subí **el contenido de esta carpeta** (no la carpeta padre: los archivos `index.html`, `styles.css`, `app.js`, `engine.js`, `words.js` tienen que quedar en la raíz del repo).
3. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Branch: `main`, folder: `/ (root)`. Guardá.
5. En un minuto va a aparecer la URL. Abrila y pasá el teléfono.

No hace falta servidor, base de datos ni cuenta. Todo pasa en el navegador.

## Novedades: Salas y Sistema de Puntuaciones 🏆

- **Salas de Juego Independientes**: Podés crear diferentes salas (ej: *"Los Pibes"*, *"Familia"*, *"Oficina"*) con sus propios grupos de jugadores y estadísticas acumuladas.
- **Puntuaciones Acumuladas**: Los puntos se van sumando a lo largo de las partidas y se guardan automáticamente en el navegador.
- **Leaderboard Post-Partida Animado**:
  1. Muestra la tabla tal cual estaba antes de la partida.
  2. Revela los nuevos puntos con un contador ascendente y badges energéticos.
  3. Si un jugador supera a otro en el ranking, las filas se reordenan dinámicamente con una animación fluida (`▲ +X puestos`), iluminando al nuevo líder con confeti.
- **Criterio de Puntos**:
  - **Inocente Ganador**: **+120 pts** si sobrevivió (**+70 pts** si fue eliminado antes pero su equipo ganó).
  - **Impostor Ganador**: **+260 pts** (¡vale más del doble que ganar como inocente!).
  - **Supervivencia del Impostor**:
    - Si lo descubren en la 1ª ronda: **0 pts** de supervivencia.
    - Si sobrevive a la 1ª ronda y cae en la 2ª: **+50 pts**.
    - Rondas posteriores: **+50 pts** por cada ronda adicional sobrevivida.
    - Infiltración perfecta (gana sin ser descubierto): **+120 pts** extra.
  - **Premio Consuelo**: **+20 pts** para los inocentes si ganan los impostores.

## Cómo se juega

1. Elegí o creá una sala para tu grupo. Cargá los nombres en el orden de la mesa.
2. Los impostores se eligen **al azar** (entre 1 y el máximo posible según la cantidad de jugadores).
3. Cada jugador desliza su carta hacia arriba cuando nadie mira.
4. Después de la cuenta regresiva, hay dos minutos de referencia para decir palabras relacionadas.
5. Voten en voz alta. En la página solo se toca a quien tuvo más votos.
6. Al finalizar la partida, pasá a la **Tabla de Posiciones** para ver la animación de puntos y quién lidera el podio.

Tema oscuro por defecto, con botón para pasar a modo claro.

---

## COSAS PARA AGREGAR / MODIFICAR:

- Poder elegir si la cantidad de impostores sea random o elegida manualmente
- Poder terminar el torneo y que salga el ganador. Tmb opción para resetear los puntos
- Arreglar estilo en modo claro, en zona de votación (los nombres estan en blanco)
- Aumentar la fuente en textos que estan muy chicos
