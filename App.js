import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MC24 Laghouat</Text>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Create Match</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>Join Match</Text>
      </TouchableOpacity>

      <Text style={styles.note}>Bluetooth multiplayer will be added step by step</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e783c',
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 35
  },
  button: {
    width: 240,
    backgroundColor: '#111',
    paddingVertical: 16,
    borderRadius: 16,
    marginVertical: 8,
    alignItems: 'center'
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  },
  note: {
    color: '#e8e8e8',
    marginTop: 25,
    fontSize: 13
  }
});
