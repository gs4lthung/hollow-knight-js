# Hollow Knight JavaScript Game

A web-based implementation of Hollow Knight built with vanilla JavaScript, HTML5 Canvas, and modern web technologies. This project recreates the atmospheric 2D platformer experience in the browser.

**Project Initiated: 2022** | **Created WITHOUT the use of any Artificial Intelligence**

![Hollow Knight Game Screenshot](image.png)

## 🎮 Game Overview

This is a browser-based adaptation of the beloved indie game Hollow Knight. Players control the enigmatic Knight as they explore a vast, ancient kingdom beneath the fading town of Dirtmouth. The game features platforming mechanics, combat systems, boss battles, and atmospheric audio-visual design.

## ✨ Features

### Core Gameplay
- **2D Platformer Mechanics**: Jump, dash, and navigate through challenging environments
- **Combat System**: Attack enemies with your nail, use special abilities like blast attacks
- **Boss Battles**: Face off against formidable foes like the False Knight
- **Enemy AI**: Fight against Crawlids, Booflies, and other creatures
- **Health System**: Manage your health with a visual health bar
- **Currency System**: Collect geo (money) from defeated enemies

### Technical Features
- **HTML5 Canvas Rendering**: Smooth 60fps gameplay
- **Sprite Animation**: Detailed character and enemy animations
- **Audio System**: Immersive sound effects and background music
- **Camera System**: Dynamic camera following with screen shake effects
- **Particle Effects**: Visual feedback for attacks and environmental effects
- **Pause System**: Full game pause with options menu
- **Fullscreen Mode**: Immersive fullscreen gameplay experience

### UI/UX Features
- **Responsive Design**: Works across different screen sizes
- **Landing Page**: Beautiful promotional website with game information
- **Interactive Elements**: Animated menus and transitions
- **Settings Menu**: Volume control and FPS display options

## 🚀 Getting Started

### Prerequisites
- A modern web browser (Chrome, Firefox, Edge)
- [Node.js](https://nodejs.org/) 18 or newer

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/gs4lthung/hollow-knight-js.git
   cd hollow-knight-js
   ```

2. **Install and start the LAN server**
   ```bash
   npm install
   npm start
   ```
   The server prints two kinds of link: `http://localhost:3000/game.html` for this computer, and `http://<your-ip>:3000/game.html` for friends on the same network.

3. **Play together (LAN co-op, up to 4 players)**
   - Everyone opens the link, picks a character and presses **Play with Friends** (**Solo** plays offline).
   - In the lobby everyone presses **Ready**; the host (first to join) presses **Start** and you all begin
     together. The lobby shows the link friends should open. Friends who join later drop straight in.
   - Type a name on the start screen; it shows above your knight, in the lobby and on the scoreboard.
   - Refreshed or dropped out? Rejoin within a minute to get your slot, colour and score back.
   - The host runs the enemies; keep the host's game tab in front.
   - Downed teammates can be revived: stand next to them and hold **E** for 2 seconds. If everyone is
     down, the party respawns (and the boss recovers). A scoreboard with kills, boss damage, deaths,
     revives and a title for each player shows before the credits.
   - On Windows, allow Node.js through the firewall (private networks) the first time a friend connects.
   - Opened without the server (any other static file server), the game runs in single-player mode.

### Hosting on IIS

IIS can run the game server for you (it starts and restarts `node server.js` itself), so friends
open `http://<pc-name-or-ip>/game.html` on port 80 instead of `:3000`. One-time setup, as an administrator:

1. **Windows features** (*Turn Windows features on or off* → Internet Information Services →
   World Wide Web Services → Application Development Features): tick **WebSocket Protocol**.
2. **Install [HttpPlatformHandler](https://www.iis.net/downloads/microsoft/httpplatformhandler)**
   (Microsoft's IIS module that runs Node behind IIS).
3. **Write the config** in the project folder: `npm install`, then `npm run iis-config`
   (`npm run iis-config -- 8080` if the site uses another port; add a public address as a second
   argument, e.g. `npm run iis-config -- 443 https://game.example.com`, to show that link in the lobby).
4. **Create the site** in IIS Manager: Sites → *Add Website*, physical path = the project folder,
   binding = port 80 (or your port). Give **IIS_IUSRS** read access to the folder and modify access to
   its `logs` folder (server output lands in `logs/node_*.log`).
5. Close any `npm start` window (it would be a separate game on `:3000`), open `http://localhost/game.html`, and let friends in
   through the Windows firewall on the site's port.

Players who open the game by the PC's address see that same address as the invite link in the lobby.


## 🎯 How to Play

### Controls
- **Left / Right Arrow**: Move
- **Z / Up Arrow**: Jump
- **X**: Attack with nail
- **S**: Dash
- **A**: Blast attack (charged by hitting enemies)
- **Space / E**: Interact (boss door, rest at bench); hold next to a downed teammate to revive
- **Escape**: Pause game
- **F**: Toggle fullscreen
- **Enter**: Start game

**Controller** (Xbox / PlayStation layout): stick or D-pad move, **A** jump, **X** attack,
**B** dash, **Y** skill, **LB/RB** interact (hold to revive), **Start** pause.
On the start screen the D-pad picks a knight and **A** starts; in the lobby **A** toggles Ready
and **Start** lets the host begin.

### Sunken Grove (Area 2)
Defeating the False Knight opens the way to the **Sunken Grove**, a flooded mossy cavern with
its own bench, new enemies and a second boss:
- **Mossling**: wanders, then charges at a knight who comes close.
- **Spore Drifter**: hovers out of reach and puffs spores (hit a spore to pop it).
- **Grove Warden**: walks in and slashes, leaps at far knights, and summons thorns under
  everyone (a glowing mark warns where they'll burst). Break its armor to stun it, then
  strike. Defeating it ends the run with the scoreboard.

The Grove's gate needs its own kills (shown as "Door" on the HUD). Art lives in
`assets/game/area2/` (see `docs/area2-art-brief.md`); any piece that isn't drawn yet shows a
teal-tinted stand-in from the first area.

### Bench Shop
Press **E** at the bench to rest (full hearts) and open the shop. Every kill by anyone on the
team gives each player a coin; spend them on upgrades: **Mask Shard** (+1 heart),
**Sharpened Nail** (+1 damage), **Soul Catcher** (skill charges faster), **Quick Slash**
(faster attacks), **Long Nail** (more reach). The HUD shows your coins and the kills the team
still needs to open the boss door. Alone the game pauses while you shop; with friends it
keeps going, but you can't be hurt at the bench.

### Elemental Combos
When two elements' skills touch, they combine:
- **Fire + Wind = Fire Tornado**: the tornado ignites, hits harder and faster, lasts longer
- **Fire + Water = Steam Burst**: an explosion around the water wave
- **Earth + Wind = Sandstorm**: the tornado grows and hits harder

### Gameplay Tips
- Defeat enemies to collect geo (money)
- Use platforms to reach higher areas
- Watch your health - you have 5 hearts
- Find the boss door by defeating enough enemies
- Use dash to avoid attacks and reach distant platforms
- Rest at benches to recover health

## 🏗️ Project Structure

```
hollow-knight-js/
├── assets/                 # Game assets
│   ├── game/              # In-game sprites and audio
│   │   ├── audio/         # Sound effects and music
│   │   ├── hero/          # Player character sprites
│   │   ├── boss/          # Boss enemy sprites
│   │   ├── enemies/       # Enemy sprites (crawlid, boofly)
│   │   └── ui/            # User interface elements
│   ├── landing/           # Landing page assets
│   └── font/              # Custom fonts
├── css/                   # Stylesheets
│   ├── game.css          # Game-specific styles
│   ├── landing.css       # Landing page styles
│   └── style.css         # Base styles
├── js/                    # JavaScript modules
│   ├── game/             # Core game logic
│   │   ├── model/        # Game object classes
│   │   ├── facade/       # Utility modules
│   │   └── parent/       # Base classes
│   └── landing.js        # Landing page functionality
├── index.html            # Landing page
└── game.html             # Game page
```

## 🛠️ Technical Architecture

### Core Systems
- **Game Engine**: Custom JavaScript game engine with entity-component architecture
- **Rendering**: HTML5 Canvas with sprite-based graphics
- **Physics**: Custom collision detection and gravity system
- **Audio**: Web Audio API integration with volume controls
- **Animation**: Frame-based sprite animation system

### Key Classes
- `GAME`: Main game controller and state management
- `Player`: Player character with movement and combat abilities
- `Boss`: Boss enemy with complex AI patterns
- `Crawlid/Boofly`: Enemy classes with different behaviors
- `Camera`: Dynamic camera system with smooth following
- `UI`: User interface management
- `Audio`: Audio system with background music and sound effects

## 🎨 Assets

The game includes:
- **Character Sprites**: Detailed animations for player, enemies, and bosses
- **Environment Art**: Backgrounds, platforms, and environmental objects
- **Audio**: High-quality sound effects and atmospheric music
- **UI Elements**: Health bars, currency display, and menu graphics

## 🔧 Development

### Adding New Features
1. Create new model classes in `js/game/model/`
2. Extend base classes from `js/game/parent/`
3. Register new objects in the main game loop
4. Add corresponding sprites to the assets folder

### Performance Optimization
- Sprite caching for improved performance
- Efficient collision detection algorithms
- Optimized rendering pipeline
- Audio preloading and management

## 🐛 Known Issues

- Some audio files may not load in certain browsers
- Performance may vary on older devices
- Fullscreen mode requires user interaction to activate

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

### Development Guidelines
- Follow existing code style and structure
- Test changes across different browsers
- Ensure assets are properly optimized
- Document new features and changes

## 📄 License

This project is inspired by Hollow Knight by Team Cherry. This is a fan-made recreation for educational purposes.

## 🙏 Acknowledgments

- **Team Cherry**: Original creators of Hollow Knight
- **Christopher Larkin**: Composer of the original soundtrack

## 📞 Contact

Created by TinTin Winata as part of Web Design NAR 23-1 project.

**Important Note**: This project was initiated in 2022 and developed entirely without the use of any artificial intelligence tools or assistance. All code, game logic, and implementation was created through traditional programming methods and human creativity.

---

*"Alongside Courage And Perseverance We Shape and Define Our Future"* - JT 22-1

**JeTe Knight** - Inspired by Hollow Knight
