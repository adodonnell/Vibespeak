import { useState, useEffect } from 'react';
import { voiceClient, audioPresets, AudioPreset } from '../services/voice-client';
import '../styles/theme.css';

import { UserStatus } from './UserList';

interface UserSettingsProps {
  username: string;
  onUsernameChange: (username: string) => void;
  userStatus?: UserStatus;
  onStatusChange?: (status: UserStatus) => void;
  onNotificationSettingsClick?: () => void;
}

function UserSettings({ username, onUsernameChange }: UserSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editUsername, setEditUsername] = useState(username);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string>('');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string>('');
  
  // Audio settings state
  const [inputVolume, setInputVolume] = useState(100);
  const [outputVolume, setOutputVolume] = useState(100);
  const [transmissionMode, setTransmissionMode] = useState<'voice-activity' | 'push-to-talk'>('voice-activity');
  const [vadSensitivity, setVadSensitivity] = useState(50);
  const [pttKey, setPttKey] = useState('v');
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  
  // Preset state
  const [selectedPreset, setSelectedPreset] = useState('Default');
  const [presets] = useState<AudioPreset[]>(audioPresets);

  useEffect(() => {
    loadDevices();
  }, [isOpen]);

  useEffect(() => {
    // Load current audio settings from voice client
    const settings = voiceClient.getAudioSettings();
    setInputVolume(settings.inputVolume);
    setOutputVolume(settings.outputVolume);
    setTransmissionMode(settings.transmissionMode);
    setVadSensitivity(settings.vadSensitivity);
    setPttKey(settings.pttKey);
    setNoiseSuppression(settings.noiseSuppression);
    setEchoCancellation(settings.echoCancellation);
    setAutoGainControl(settings.autoGainControl);
  }, [isOpen]);

  const loadDevices = async () => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const inputs = await voiceClient.getAudioDevices();
      const outputs = await voiceClient.getAudioOutputDevices();
      
      setAudioInputDevices(inputs);
      setAudioOutputDevices(outputs);
      
      if (inputs.length > 0 && !selectedInputDevice) {
        setSelectedInputDevice(inputs[0].deviceId);
      }
      if (outputs.length > 0 && !selectedOutputDevice) {
        setSelectedOutputDevice(outputs[0].deviceId);
      }
    } catch (err) {
      console.error('Failed to load audio devices:', err);
    }
  };

  const handleSave = () => {
    if (editUsername.trim()) {
      onUsernameChange(editUsername.trim());
    }
    
    // Save audio settings
    voiceClient.setAudioSettings({
      inputDeviceId: selectedInputDevice,
      outputDeviceId: selectedOutputDevice,
      inputVolume,
      outputVolume,
      transmissionMode,
      vadSensitivity,
      pttKey,
      noiseSuppression,
      echoCancellation,
      autoGainControl,
    });
    
    setIsOpen(false);
  };

  const handleCancel = () => {
    setEditUsername(username);
    setIsOpen(false);
  };

  const handleTestMic = async () => {
    if (isTestingMic) {
      // Stop the test
      voiceClient.stopMicrophoneTest();
      setIsTestingMic(false);
      return;
    }
    
    try {
      await voiceClient.testMicrophone();
      setIsTestingMic(true);
    } catch (err) {
      console.error('Failed to test microphone:', err);
      setIsTestingMic(false);
    }
  };

  const handleTestSpeaker = async () => {
    if (isTestingSpeaker) {
      setIsTestingSpeaker(false);
      return;
    }
    
    try {
      setIsTestingSpeaker(true);
      await voiceClient.testOutputDevice(selectedOutputDevice);
      setTimeout(() => setIsTestingSpeaker(false), 1000);
    } catch (err) {
      console.error('Failed to test speaker:', err);
      setIsTestingSpeaker(false);
    }
  };

  const handleInputVolumeChange = (value: number) => {
    setInputVolume(value);
    setSelectedPreset(''); // Clear preset when manually adjusting
    voiceClient.setInputVolume(value);
  };

  const handleOutputVolumeChange = (value: number) => {
    setOutputVolume(value);
    setSelectedPreset(''); // Clear preset when manually adjusting
    voiceClient.setOutputVolume(value);
  };

  const handleTransmissionModeChange = (mode: 'voice-activity' | 'push-to-talk') => {
    setTransmissionMode(mode);
    voiceClient.setTransmissionMode(mode);
  };

  const handleVadSensitivityChange = (value: number) => {
    setVadSensitivity(value);
    setSelectedPreset(''); // Clear preset when manually adjusting
    voiceClient.setVadSensitivity(value);
  };

  const handlePttKeyChange = (key: string) => {
    setPttKey(key);
    voiceClient.setPttKey(key);
  };

  const handlePresetChange = (presetName: string) => {
    setSelectedPreset(presetName);
    voiceClient.applyPreset(presetName);
    
    // Update UI to reflect preset settings
    const settings = voiceClient.getAudioSettings();
    setInputVolume(settings.inputVolume);
    setOutputVolume(settings.outputVolume);
    setVadSensitivity(settings.vadSensitivity);
    setNoiseSuppression(settings.noiseSuppression);
    setEchoCancellation(settings.echoCancellation);
    setAutoGainControl(settings.autoGainControl);
  };

  if (isOpen) {
    return (
      <div className="user-settings-panel">
        <h3>User Settings</h3>
        
        {/* Username */}
        <div className="settings-field">
          <label>Username</label>
          <input
            type="text"
            value={editUsername}
            onChange={(e) => setEditUsername(e.target.value)}
            placeholder="Enter username"
          />
        </div>

        {/* Audio Presets */}
        <div className="settings-field">
          <label>Audio Preset</label>
          <select 
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {presets.map(preset => (
              <option key={preset.name} value={preset.name}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* Audio Input Device */}
        <div className="settings-field">
          <label>Microphone</label>
          <select 
            value={selectedInputDevice} 
            onChange={(e) => setSelectedInputDevice(e.target.value)}
          >
            {audioInputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${audioInputDevices.indexOf(device) + 1}`}
              </option>
            ))}
          </select>
        </div>

        {/* Audio Output Device */}
        <div className="settings-field">
          <label>Speakers</label>
          <select 
            value={selectedOutputDevice} 
            onChange={(e) => setSelectedOutputDevice(e.target.value)}
          >
            {audioOutputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Speaker ${audioOutputDevices.indexOf(device) + 1}`}
              </option>
            ))}
          </select>
        </div>

        {/* Input Volume */}
        <div className="settings-field">
          <label>Input Volume: {inputVolume}%</label>
          <input
            type="range"
            min="0"
            max="200"
            value={inputVolume}
            onChange={(e) => handleInputVolumeChange(Number(e.target.value))}
            className="volume-slider"
          />
        </div>

        {/* Output Volume */}
        <div className="settings-field">
          <label>Output Volume: {outputVolume}%</label>
          <input
            type="range"
            min="0"
            max="200"
            value={outputVolume}
            onChange={(e) => handleOutputVolumeChange(Number(e.target.value))}
            className="volume-slider"
          />
        </div>

        {/* Transmission Mode */}
        <div className="settings-field">
          <label>Transmission Mode</label>
          <select 
            value={transmissionMode}
            onChange={(e) => handleTransmissionModeChange(e.target.value as 'voice-activity' | 'push-to-talk')}
          >
            <option value="voice-activity">Voice Activity</option>
            <option value="push-to-talk">Push to Talk</option>
          </select>
        </div>

        {/* PTT Key (only shown in PTT mode) */}
        {transmissionMode === 'push-to-talk' && (
          <div className="settings-field">
            <label>PTT Key</label>
            <select 
              value={pttKey}
              onChange={(e) => handlePttKeyChange(e.target.value)}
            >
              <option value="v">V</option>
              <option value="space">Space</option>
              <option value="ctrl">Ctrl</option>
              <option value="alt">Alt</option>
              <option value="shift">Shift</option>
            </select>
            <small>Press this key to transmit</small>
          </div>
        )}

        {/* VAD Sensitivity (only shown in voice activity mode) */}
        {transmissionMode === 'voice-activity' && (
          <div className="settings-field">
            <label>Voice Detection Sensitivity: {vadSensitivity}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={vadSensitivity}
              onChange={(e) => handleVadSensitivityChange(Number(e.target.value))}
              className="volume-slider"
            />
            <small>Higher = more sensitive to quiet sounds</small>
          </div>
        )}

        {/* Audio Processing Toggles */}
        <div className="settings-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={noiseSuppression}
              onChange={(e) => {
                setNoiseSuppression(e.target.checked);
                setSelectedPreset('');
                voiceClient.setAudioSettings({ noiseSuppression: e.target.checked });
              }}
            />
            Noise Suppression
          </label>
        </div>

        <div className="settings-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={echoCancellation}
              onChange={(e) => {
                setEchoCancellation(e.target.checked);
                setSelectedPreset('');
                voiceClient.setAudioSettings({ echoCancellation: e.target.checked });
              }}
            />
            Echo Cancellation
          </label>
        </div>

        <div className="settings-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoGainControl}
              onChange={(e) => {
                setAutoGainControl(e.target.checked);
                setSelectedPreset('');
                voiceClient.setAudioSettings({ autoGainControl: e.target.checked });
              }}
            />
            Auto Gain Control
          </label>
        </div>

        {/* Test Buttons */}
        <div className="settings-field test-buttons">
          <button 
            className={`test-mic-btn ${isTestingMic ? 'testing' : ''}`}
            onClick={handleTestMic}
          >
            {isTestingMic ? 'Stop Test' : 'Test Mic'}
          </button>
          
          <button 
            className={`test-mic-btn ${isTestingSpeaker ? 'testing' : ''}`}
            onClick={handleTestSpeaker}
          >
            {isTestingSpeaker ? 'Testing...' : 'Test Speaker'}
          </button>
        </div>

        {isTestingMic && (
          <div className="mic-test-indicator">
            <div className="mic-level-bar">
              <div className="mic-level-fill" style={{ width: '50%' }}></div>
            </div>
            <span>Speak to test your microphone</span>
          </div>
        )}

        <div className="settings-actions">
          <button className="save-btn" onClick={handleSave}>Save</button>
          <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="user-panel" onClick={() => setIsOpen(true)}>
      <div className="user-avatar-small">
        {username.charAt(0).toUpperCase()}
      </div>
      <div className="user-info">
        <span className="user-name">{username}</span>
        <span className="user-status">Online</span>
      </div>
      <div className="settings-icon">⚙️</div>
    </div>
  );
}

export default UserSettings;
