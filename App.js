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

const TEAM_A_COLOR = "#e53935";
const TEAM_B_COLOR = "#1e88e5";

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [isHost, setIsHost] = useState(false);

  const [playerName, setPlayerName] = useState("Player");
  const [team, setTeam] = useState("A");
  const [teamAName, setTeamAName] = useState("MC24");
  const [teamBName, setTeamBName] = useState("Guest");
  const [hostIp, setHostIp] = useState("");
  const [status, setStatus] = useState("Offline");

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const [players, setPlayers] = useState({});
  const [me, setMe] = useState({
    id: String(Date.now()),
    x: 120,
    y: 210,
    team: "A",
    name: "Player"
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
  const playersRef = useRef(players);

  useEffect(() => {
    ballRef.current = ball;
  }, [ball]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  function playerColor(pTeam) {
    return pTeam === "A" ? TEAM_A_COLOR : TEAM_B_COLOR;
  }

  function sendAll(data) {
    const msg = JSON.stringify(data) + "\n";
    clientsRef.current.forEach(socket => {
      try {
        socket.write(msg);
      } catch {}
    });
  }

  function sendToHost(data) {
    if (!socketRef.current) return;
    try {
      socketRef.current.write(JSON.stringify(data) + "\n");
    } catch {}
  }

  function broadcastState(nextBall, a, b, nextPlayers = playersRef.current) {
    sendAll({
      type: "state",
      ball: nextBall,
      scoreA: a,
      scoreB: b,
      players: nextPlayers
    });
  }

  function startHost() {
    try {
      const nextMe = {
        ...me,
        name: playerName,
        team,
        x: team === "A" ? 120 : 620,
        y: 210
      };

      setMe(nextMe);
      last.current = { x: nextMe.x, y: nextMe.y };
      setPlayers({ [nextMe.id]: nextMe });
      setIsHost(true);

      const server = TcpSocket.createServer(socket => {
        clientsRef.current.push(socket);

        socket.on("data", data => {
          const messages = data.toString().split("\n").filter(Boolean);

          messages.forEach(raw => {
            try {
              const msg = JSON.parse(raw);

              if (msg.type === "join") {
                setPlayers(prev => {
                  const updated = {
                    ...prev,
                    [msg.player.id]: msg.player
                  };
                  broadcastState(ballRef.current, scoreA, scoreB, updated);
                  return updated;
                });
              }

              if (msg.type === "move") {
                setPlayers(prev => {
                  const updated = {
                    ...prev,
                    [msg.player.id]: msg.player
                  };
                  broadcastState(ballRef.current, scoreA, scoreB, updated);
                  return updated;
                });
              }
            } catch {}
          });
        });

        socket.on("close", () => {
          clientsRef.current = clientsRef.current.filter(s => s !== socket);
        });
      });

      server.listen({ port: PORT, host: "0.0.0.0" }, () => {
        setStatus("Host ready - port " + PORT);
        setScreen("game");
      });

      serverRef.current = server;
    } catch (e) {
      Alert.alert("Host error", String(e));
    }
  }

  function joinHost() {
    try {
      const startX = team === "A" ? 160 : 600;
      const nextMe = {
        ...me,
        name: playerName,
        team,
        x: startX,
        y: 210
      };

      setMe(nextMe);
      last.current = { x: nextMe.x, y: nextMe.y };
      setIsHost(false);

      const socket = TcpSocket.createConnection(
        { port: PORT, host: hostIp },
        () => {
          socketRef.current = socket;
          setStatus("Connected to host");
          setScreen("game");

          sendToHost({
            type: "join",
            player: nextMe
          });
        }
      );

      socket.on("data", data => {
        const messages = data.toString().split("\n").filter(Boolean);

        messages.forEach(raw => {
          try {
            const msg = JSON.parse(raw);

            if (msg.type === "state") {
              setPlayers(msg.players || {});
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

  function hitBallWithPlayer(p, currentBall) {
    const dx = currentBall.x - p.x;
    const dy = currentBall.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 58) {
      const safeDist = dist || 1;
      const nx = dx / safeDist;
      const ny = dy / safeDist;

      return {
        ...currentBall,
        vx: nx * 8.5,
        vy: ny * 8.5
      };
    }

    return currentBall;
  }

  useEffect(() => {
    if (screen !== "game" || !isHost) return;

    const loop = setInterval(() => {
      setBall(prev => {
        let nextBall = {
          x: prev.x + prev.vx,
          y: prev.y + prev.vy,
          vx: prev.vx * 0.992,
          vy: prev.vy * 0.992
        };

        Object.values(playersRef.current).forEach(p => {
          nextBall = hitBallWithPlayer(p, nextBall);
        });

        if (nextBall.y < 45 || nextBall.y > FIELD_H - 28) {
          nextBall.vy *= -1;
        }

        if (nextBall.x < 0) {
          const newScoreB = scoreB + 1;
          setScoreB(newScoreB);

          const reset = { x: 370, y: 210, vx: 0, vy: 0 };
          broadcastState(reset, scoreA, newScoreB);
          return reset;
        }

        if (nextBall.x > FIELD_W) {
          const newScoreA = scoreA + 1;
          setScoreA(newScoreA);

          const reset = { x: 370, y: 210, vx: 0, vy: 0 };
          broadcastState(reset, newScoreA, scoreB);
          return reset;
        }

        broadcastState(nextBall, scoreA, scoreB);
        return nextBall;
      });
    }, 16);

    return () => clearInterval(loop);
  }, [screen, isHost, scoreA, scoreB]);

  function updateMyMove(next) {
    setMe(next);

    setPlayers(prev => {
      const updated = {
        ...prev,
        [next.id]: next
      };
      return updated;
    });

    if (isHost) {
      const updatedPlayers = {
        ...playersRef.current,
        [next.id]: next
      };
      broadcastState(ballRef.current, scoreA, scoreB, updatedPlayers);
    } else {
      sendToHost({
        type: "move",
        player: next
      });
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,

      onPanResponderMove: (_, g) => {
        const next = {
          ...me,
          name: playerName,
          team,
          x: Math.max(10, Math.min(FIELD_W - 60, last.current.x + g.dx)),
          y: Math.max(60, Math.min(FIELD_H - 60, last.current.y + g.dy))
        };

        updateMyMove(next);
      },

      onPanResponderRelease: (_, g) => {
        last.current = {
          x: Math.max(10, Math.min(FIELD_W - 60, last.current.x + g.dx)),
          y: Math.max(60, Math.min(FIELD_H - 60, last.current.y + g.dy))
        };
      }
    })
  ).current;

  if (screen === "menu") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>MC24 Laghouat</Text>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.teamBtn, team === "A" && styles.teamAActive]}
            onPress={() => setTeam("A")}
          >
            <Text style={styles.buttonText}>Team A</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.teamBtn, team === "B" && styles.teamBActive]}
            onPress={() => setTeam("B")}
          >
            <Text style={styles.buttonText}>Team B</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          value={playerName}
          onChangeText={setPlayerName}
          placeholder="Player name"
          placeholderTextColor="#777"
        />

        <TextInput
          style={styles.input}
          value={teamAName}
          onChangeText={setTeamAName}
          placeholder="Team A name"
          placeholderTextColor="#777"
        />

        <TextInput
          style={styles.input}
          value={teamBName}
          onChangeText={setTeamBName}
          placeholder="Team B name"
          placeholderTextColor="#777"
        />

        <TouchableOpacity style={styles.button} onPress={startHost}>
          <Text style={styles.buttonText}>Create WiFi Match</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          value={hostIp}
          onChangeText={setHostIp}
          placeholder="Host IP مثل 192.168.43.1"
          placeholderTextColor="#777"
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
        {teamAName} {scoreA} - {scoreB} {teamBName}
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
            {
              left: p.x,
              top: p.y,
              backgroundColor: playerColor(p.team)
            }
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
          styles.myPlayer,
          {
            left: me.x,
            top: me.y,
            backgroundColor: playerColor(me.team)
          }
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
    backgroundColor: "#123f25",
    justifyContent: "center",
    alignItems: "center"
  },
  title: {
    color: "white",
    fontSize: 36,
    fontWeight: "bold",
    marginBottom: 14
  },
  row: {
    flexDirection: "row",
    marginBottom: 8
  },
  teamBtn: {
    width: 130,
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    marginHorizontal: 5,
    borderWidth: 2,
    borderColor: "#555"
  },
  teamAActive: {
    backgroundColor: TEAM_A_COLOR,
    borderColor: "white"
  },
  teamBActive: {
    backgroundColor: TEAM_B_COLOR,
    borderColor: "white"
  },
  input: {
    width: 285,
    backgroundColor: "white",
    padding: 11,
    borderRadius: 12,
    marginVertical: 5
  },
  button: {
    width: 285,
    backgroundColor: "#111",
    padding: 13,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 7
  },
  buttonText: {
    color: "white",
    fontWeight: "bold"
  },
  status: {
    color: "white",
    marginTop: 10
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
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 18,
    paddingVertical: 5,
    borderRadius: 10
  },
  centerLine: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "white",
    opacity: 0.85
  },
  centerCircle: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 130,
    height: 130,
    marginLeft: -65,
    marginTop: -65,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: "white",
    opacity: 0.85
  },
  goalLeft: {
    position: "absolute",
    left: 0,
    top: "36%",
    width: 14,
    height: 125,
    backgroundColor: "white"
  },
  goalRight: {
    position: "absolute",
    right: 0,
    top: "36%",
    width: 14,
    height: 125,
    backgroundColor: "white"
  },
  ball: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#111",
    zIndex: 4
  },
  player: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5
  },
  myPlayer: {
    borderColor: "white",
    borderWidth: 3
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
    borderRadius: 10,
    zIndex: 20
  }
});
