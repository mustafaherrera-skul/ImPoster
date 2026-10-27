# El Impostor

Juego de mesa para un solo teléfono. Los inocentes ven la palabra. El impostor solo recibe una pista.

## Cómo publicarlo en GitHub Pages

1. Creá un repositorio vacío en GitHub.
2. Subí **el contenido de esta carpeta** (no la carpeta padre: los archivos `index.html`, `styles.css`, `app.js`, `engine.js`, `words.js` tienen que quedar en la raíz del repo).
3. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Branch: `main`, folder: `/ (root)`. Guardá.
5. En un minuto va a aparecer la URL. Abrila y pasá el teléfono.

No hace falta servidor, base de datos ni cuenta. Todo pasa en el navegador.

## Sistema de Torneo y Puntuaciones 🏆

- **Puntuaciones Acumuladas**: Los puntos se van sumando a lo largo de las partidas y se guardan automáticamente en el navegador.
- **Configuración de Impostores**: Podés elegir si la cantidad de impostores es **al azar** (entre 1 y el máximo) o **fija/manual** (1, 2, etc.).
- **Finalización de Torneo & Reinicio de Puntos**:
  - Botón **"🏆 Terminar Torneo"** en la tabla de posiciones: corona al campeón del torneo con podio (1°, 2° y 3° puesto), confeti y estadísticas. Permite iniciar un nuevo torneo volviendo los puntos a 0.
  - Botón **"↺ Reiniciar Puntos"**: para resetear las puntuaciones a 0 en cualquier momento sin necesidad de terminar el juego.
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
    - Infiltración perfecta: **+120 pts** extra (aplica únicamente si hubo 2 o más impostores en juego).
  - **Premio Consuelo**: **+20 pts** para los inocentes si ganan los impostores.

## Cómo se juega

1. Cargá los nombres de los jugadores en el orden de la mesa.
2. Elegí el modo de impostores: aleatorio o cantidad fija manual.
3. Cada jugador desliza su carta hacia arriba cuando nadie mira.
4. Después de la cuenta regresiva, hay dos minutos de referencia con el orden de oradores visible en pantalla.
5. Voten en voz alta. En la página solo se toca a quien tuvo más votos.
6. Al finalizar la partida, pasá a la **Tabla de Posiciones** para ver la animación de puntos y quién lidera el podio.

Tema oscuro por defecto, con botón para pasar a modo claro.

---

## PRÓXIMAS COSAS PARA AGREGAR:

- Añadir una pequeña probabilidad a un nuevo modo: modo caos. En este modo, la partida va a ser modificada de forma rara (sin que los jugadores sepan, ellos van a pensar de que es partida normal), algún ejemplo seria:

  1. Todos impostores (con sus variantes):
    - que a algunos no les salga pista y a otros les salga una pista
    - que a todos le salga pista

  2. Que a todos les salga la misma palabra, pero a unos les salga como pista y a otros como palabra de inocente

  3. Todos inocentes pero con palabras distintas

  4. Todos inocentes sin impostor

  5. TIRAME IDEAS Y TE DIGO SI ESTAN BUENAS PARA METERLAS O NO

Fijate de que sea una opción que se pueda desactivar, y por ahora deja una opcion para que salga todo el rato, para testear

