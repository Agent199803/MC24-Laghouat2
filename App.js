import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  PermissionsAndroid,
  Platform
} from "react-native";

import RNBluetoothClassic from "react-native-bluetooth-classic";

export default function App() {
  const [screen, setScreen] = useState("menu");
  const [playerName, setPlayerName] = useState("Player");
  const [teamName, setTeamName] = useState("MC24");
  const [color, setColor] = useState("#e53935");
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState("Not connected");

  async function requestBluetoothPermissions() {
    if (Platform.OS !== "android") return true;

    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      ]);

      return Object.values(granted).every(
        value => value === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (e) {
      Alert.alert("Permission error", String(e));
      return false;
    }
  }

  async function loadDevices() {
    const ok = await requestBluetoothPermissions();
    if (!ok) {
      Alert.alert("Bluetooth", "Permissions refused");
      return;
    }

    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();

      if (!enabled) {
        Alert.alert("Bluetooth", "Please enable Bluetooth");
        return;
      }

      const paired = await RNBluetoothClassic.getBondedDevices();
      setDevices(paired);
      setScreen("devices");
    } catch (e) {
      Alert.alert("Bluetooth error", String(e));
    }
  }

  async function connectToDevice(device) {
    try {
      setStatus("Connecting...");
      const connected = await device.connect();
      if (connected) {
        setStatus("Connected to " + device.name);
        Alert.alert("Connected", device.name || device.address);
        setScreen("game");
      } else {
        setStatus("Connection failed");
      }
    } catch (e) {
      setStatus("Connection error");
      Alert.alert("Connect error", String(e));
    }
  }

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
          <Text style={styles.buttonText}>Local Test Game</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={loadDevices}>
          <Text style={styles.buttonText}>Join by Bluetooth</Text>
        </TouchableOpacity>

        <Text style={styles.status}>{status}</Text>
      </View>
    );
  }

  if (screen === "devices") {
    return (
      <View style={styles.menu}>
        <Text style={styles.title}>Bluetooth Devices</Text>

        <ScrollView style={{ width: "80%" }}>
          {devices.map((d, index) => (
            <TouchableOpacity
              key={index}
              style={styles.device}
              onPress={() => connectToDevice(d)}
            >
              <Text style={styles.deviceText}>{d.name || "Unknown device"}</Text>
              <Text style={styles.deviceSub}>{d.address}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.button} onPress={() => setScreen("menu")}>
          <Text style={styles.buttonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.score}>{teamName} VS Guest</Text>

      <View style={styles.centerLine} />
      <View style={styles.centerCircle} />
      <View style={styles.goalLeft} />
      <View style={styles.goalRight} />

      <View style={styles.ball} />

      <View style={[styles.player, { backgroundColor: color }]}>
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
    marginBottom: 20
  },
  input: {
    width: 260,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 12,
    marginVertical: 6
  },
  colors: {
    flexDirection: "row",
    marginVertical: 12
  },
  colorBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#111",
    marginHorizontal: 6
  },
  button: {
    backgroundColor: "#111",
    width: 260,
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
  device: {
    backgroundColor: "white",
    padding: 14,
    borderRadius: 12,
    marginVertical: 6
  },
  deviceText: {
    fontWeight: "bold",
    fontSize: 16
  },
  deviceSub: {
    color: "#555"
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
    fontWeight: "bold"
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
    left: "50%",
    top: "50%",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 2,
    borderColor: "#111"
  },
  player: {
    position: "absolute",
    left: 120,
    top: 220,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center"
  },
  playerText: {
    fontWeight: "bold",
    color: "#111"
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
