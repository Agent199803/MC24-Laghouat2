import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  PanResponder,
  Alert
} from "react-native";

import TcpSocket from "react-native-tcp-socket";

const PORT = 2424;
const FIELD_W = 760;
const FIELD_H = 430;

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [playerName, setPlayerName] = useState("Player");
  const [teamName, setTeamName] = useState("MC24");
  const [hostIp, setHostIp] = useState("");
  const [status, setStatus] = useState("Offline");

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const [players, setPlayers] = useState({});
  const [me, setMe] = useState({
    id: String(Date.now()),
    x: 120,
    y: 210,
    color: "#e53935"
  });

  const [ball, setBall] = useState({
    x: 370,
    y: 210,
    vx: 0,
    vy: 0
  });

  const serverRef = useRef(null);
  const clientsRef = useRef([]);
  const socketRef = useRef(null);
  const last = useRef({ x: 120, y: 210 });
  const ballRef = useRef(ball);

  useEffect(() => {
    ballRef.current = ball;
  }, [ball]);

  function sendAll(data) {
    const msg = JSON.stringify(data) + "\n";
    clientsRef.current.forEach(s => {
      try {
        s.write(msg);
      } catch {}
    });
  }

  function sendMove(nextMe) {
    const msg = {
      type: "move",
      id: nextMe.id,
      player: {
        ...nextMe,
        name: playerName,
        team: teamName
      }
    };

    if (socketRef.current) {
      try {
        socketRef.current.write(JSON.stringify(msg) + "\n");
      } catch {}
    }

    sendAll(msg);
  }

  function sendBall(nextBall, a, b) {
    const msg = {
      type: "ball",
      ball: nextBall,
      scoreA: a,
      scoreB: b
    };

    sendAll(msg);
  }

  function startHost() {
    try {
      const server = TcpSocket.createServer(socket => {
        clientsRef.current.push(socket);

        socket.on("data", data => {
          const messages = data.toString().split("\n").filter(Boolean);

          messages.forEach(raw => {
            try {
              const msg = JSON.parse(raw);

              if (msg.type === "move") {
                setPlayers(prev => ({
                  ...prev,
                  [msg.id]: msg.player
                }));

                sendAll(msg);
              }
            } catch {}
          });
        });

        socket.on("close", () => {
          clientsRef.current = clientsRef.current.filter(s => s !== socket);
        });
      });

      server.listen({ port: PORT, host: "0.0.0.0" }, () => {
        setStatus("Host started - port " + PORT);
        setScreen("game");
      });

      serverRef.current = server;
    } catch (e) {
      Alert.alert("Host error", String(e));
    }
  }

  function joinHost() {
    try {
      const socket = TcpSocket.createConnection(
        { port: PORT, host: hostIp },
        () => {
          socketRef.current = socket;
          setStatus("Connected");
          setScreen("game");
        }
      );

      socket.on("data", data => {
        const messages = data.toString().split("\n").filter(Boolean);

        messages.forEach(raw => {
          try {
            const msg = JSON.parse(raw);

            if (msg.type === "move") {
              setPlayers(prev => ({
                ...prev,
                [msg.id]: msg.player
              }));
            }

            if (msg.type === "ball") {
              setBall(msg.ball);
              setScoreA(msg.scoreA);
              setScoreB(msg.scoreB);
            }
          } catch {}
        });
      });

      socket.on("error", e => {
        Alert.alert("Connection error", String(e));
      });
    } catch (e) {
      Alert.alert("Join error", String(e));
    }
  }

  useEffect(() => {
    if (screen !== "game") return;

    const loop = setInterval(() => {
      setBall(prev => {
        let nx = prev.x + prev.vx;
        let ny = prev.y + prev.vy;
        let nvx = prev.vx * 0.985;
        let nvy = prev.vy * 0.985;

        if (ny < 40 || ny > FIELD_H) {
          nvy *= -1;
        }

        let nextScoreA = scoreA;
        let nextScoreB = scoreB;

        if (nx < 0) {
          nextScoreB += 1;
          setScoreB(nextScoreB);
          nx = 370;
          ny = 210;
          nvx = 0;
          nvy = 0;
        }

        if (nx > FIELD_W) {
          nextScoreA += 1;
          setScoreA(nextScoreA);
          nx = 370;
          ny = 210;
          nvx = 0;
          nvy = 0;
        }

        const nextBall = { x: nx, y: ny, vx: nvx, vy: nvy };

        if (serverRef.current) {
          sendBall(nextBall, nextScoreA, nextScoreB);
        }

        return nextBall;
      });
    }, 30);

    return () => clearInterval(loop);
  }, [screen, scoreA, scoreB]);

  function hitBall(px, py) {
    const b = ballRef.current;
    const dx = b.x - px;
    const dy = b.y - py;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 55) {
      const power = 0.22;
      const nextBall = {
        ...b,
        vx: dx * power,
        vy: dy * power
      };

      setBall(nextBall);

      if (serverRef.current) {
        sendBall(nextBall, scoreA, scoreB);
      }
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        const next = {
          ...me,
          x: Math.max(10, Math.min(FIELD_W - 50, last.current.x + g.dx)),
          y: Math.max(45, Math.min(FIELD_H - 40, last.current.y + g.dy))
        };

        setMe(next);
        sendMove(next);
        hitBall(next.x, next.y);
      },
      onPanResponderRelease: (_, g) => {
        last.current = {
          x: Math.max(10, Math.min(FIELD_W - 50, last.current.x + g.dx)),
          y: Math.max(45, Math.min(FIELD_H - 40, last.current.y + g.dy))
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
        />

        <TextInput
          style={styles.input}
          value={teamName}
          onChangeText={setTeamName}
          placeholder="Team name"
        />

        <TouchableOpacity style={styles.button} onPress={startHost}>
          <Text style={styles.buttonText}>Create WiFi Match</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={hostIp}
          onChangeText={setHostIp}
          placeholder="Host IP مثل 192.168.43.1"
        />

        <TouchableOpacity style={styles.button} onPress={joinHost}>
          <Text style={styles.buttonText}>Join WiFi Match</Text>
        </TouchableOpacity>

        <Text style={styles.status}>{status}</Text>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.score}>
        {teamName} {scoreA} - {scoreB} Guest
      </Text>

      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={styles.goalLeft} />
      <View style={styles.goalRight} />

      <View style={[styles.ball, { left: ball.x, top: ball.y }]} />

      {Object.values(players).map(p => (
        <View
          key={p.id}
          style={[
            styles.player,
            { left: p.x, top: p.y, backgroundColor: p.color || "#1e88e5" }
          ]}
        >
          <Text style={styles.playerText}>
            {(p.name || "P").slice(0, 2).toUpperCase()}
          </Text>
        </View>
      ))}

      <View
        {...panResponder.panHandlers}
        style={[
          styles.player,
          { left: me.x, top: me.y, backgroundColor: me.color }
        ]}
      >
        <Text style={styles.playerText}>
          {playerName.slice(0, 2).toUpperCase()}
        </Text>
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => setScreen("menu")}>
        <Text style={styles.buttonText}>Menu</Text>
      </TouchableOpacity>
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
    fontSize: 34,
    fontWeight: "bold",
    marginBottom: 18
  },
  input: {
    width: 280,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 12,
    marginVertical: 6
  },
  button: {
    width: 280,
    backgroundColor: "#111",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8
  },
  buttonText: {
    color: "white",
    fontWeight: "bold"
  },
  status: {
    color: "white",
    marginTop: 12
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
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    zIndex: 10
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "white"
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
    width: 12,
    height: 110,
    backgroundColor: "white"
  },
  goalRight: {
    position: "absolute",
    right: 0,
    top: "38%",
    width: 12,
    height: 110,
    backgroundColor: "white"
  },
  ball: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#111"
  },
  player: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center"
  },
  playerText: {
    color: "#111",
    fontWeight: "bold"
  },
  backBtn: {
    position: "absolute",
    right: 10,
    bottom: 10,
    backgroundColor: "#111",
    padding: 10,
    borderRadius: 10
  }
});
