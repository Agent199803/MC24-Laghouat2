import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  PanResponder
} from "react-native";

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [playerName, setPlayerName] = useState("Player");
  const [teamName, setTeamName] = useState("MC24");
  const [color, setColor] = useState("#e53935");

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const [player, setPlayer] = useState({ x: 120, y: 260 });
  const [ball, setBall] = useState({ x: 370, y: 260 });

  const last = useRef({ x: 120, y: 260 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const nx = Math.max(20, Math.min(700, last.current.x + g.dx));
        const ny = Math.max(40, Math.min(460, last.current.y + g.dy));

        setPlayer({ x: nx, y: ny });

        const dx = ball.x - nx;
        const dy = ball.y - ny;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 48) {
          let bx = ball.x + dx * 0.35;
          let by = ball.y + dy * 0.35;

          if (bx < 15) {
            setScoreB(s => s + 1);
            bx = 370;
            by = 260;
          }

          if (bx > 725) {
            setScoreA(s => s + 1);
            bx = 370;
            by = 260;
          }

          setBall({
            x: Math.max(15, Math.min(725, bx)),
            y: Math.max(35, Math.min(485, by))
          });
        }
      },
      onPanResponderRelease: (_, g) => {
        last.current = {
          x: Math.max(20, Math.min(700, last.current.x + g.dx)),
          y: Math.max(40, Math.min(460, last.current.y + g.dy))
        };
      }
    })
  ).current;

  if (screen === "menu") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>MC24 Laghouat</Text>

        <TextInput
          style={styles.input}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="Player name"
          placeholderTextColor="#aaa"
        />

        <TextInput
          style={styles.input}
          value={teamName}
          onChangeText={setTeamName}
          placeholder="Team name"
          placeholderTextColor="#aaa"
        />

        <View style={styles.colors}>
          {["#e53935", "#1e88e5", "#fdd835", "#8e24aa", "#ffffff"].map(c => (
            <TouchableOpacity
              key={c}
              onPress={() => setColor(c)}
              style={[styles.colorBtn, { backgroundColor: c }]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.button} onPress={() => setScreen("game")}>
          <Text style={styles.buttonText}>Start Local Game</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonDark}>
          <Text style={styles.buttonText}>Bluetooth coming next</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <View style={styles.score}>
        <Text style={styles.scoreText}>{teamName} {scoreA} - {scoreB} Guest</Text>
      </View>

      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={styles.goalLeft} />
      <View style={styles.goalRight} />

      <View style={[styles.ball, { left: ball.x, top: ball.y }]} />

      <View
        {...panResponder.panHandlers}
        style={[styles.player, { left: player.x, top: player.y, backgroundColor: color }]}
      >
        <Text style={styles.playerText}>{playerName.slice(0, 2).toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    flex: 1,
    backgroundColor: "#1f7a3d",
    justifyContent: "center",
    alignItems: "center"
  },
  title: {
    color: "white",
    fontSize: 36,
    fontWeight: "bold",
    marginBottom: 25
  },
  input: {
    width: 260,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    marginVertical: 6,
    fontSize: 16
  },
  colors: {
    flexDirection: "row",
    marginVertical: 15
  },
  colorBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginHorizontal: 6,
    borderWidth: 2,
    borderColor: "#111"
  },
  button: {
    width: 260,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#111",
    alignItems: "center",
    marginTop: 8
  },
  buttonDark: {
    width: 260,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#444",
    alignItems: "center",
    marginTop: 8
  },
  buttonText: {
    color: "white",
    fontWeight: "bold"
  },
  field: {
    flex: 1,
    backgroundColor: "#1f7a3d",
    borderWidth: 4,
    borderColor: "white"
  },
  score: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 10,
    zIndex: 5
  },
  scoreText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 18
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "white",
    opacity: 0.8
  },
  centerCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 120,
    height: 120,
    marginLeft: -60,
    marginTop: -60,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "white"
  },
  goalLeft: {
    position: "absolute",
    left: 0,
    top: "38%",
    width: 10,
    height: 110,
    backgroundColor: "white"
  },
  goalRight: {
    position: "absolute",
    right: 0,
    top: "38%",
    width: 10,
    height: 110,
    backgroundColor: "white"
  },
  player: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center"
  },
  playerText: {
    color: "#111",
    fontWeight: "bold"
  },
  ball: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#111"
  }
});
