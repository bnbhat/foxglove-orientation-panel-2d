import {
  PanelExtensionContext,
  Topic,
  SettingsTreeAction,
  MessageEvent as FoxgloveMessageEvent,
} from "@foxglove/extension";
import { Quaternion } from "@foxglove/schemas";
import {
  ReactElement,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import {
  PanelState,
  getInitialState,
  updateTopicStatus,
  updateTopicComponentStatus,
  updateDisplaySetting,
  getEnabledTopics,
  buildSettingsTree,
} from "./Settings";

// Constants
const MAX_TOPICS = 9;
const ORIENTATION_TYPES = [
  // "geometry_msgs/QuaternionStamped",
  // "geometry_msgs/PoseStamped",
  // "geometry_msgs/Pose",
  // "geometry_msgs/Transform",
  // "geometry_msgs/TransformStamped",
  "sensor_msgs/Imu",
  "nav_msgs/Odometry",
];

// Configuration for color mapping
const CONFIG = {
  messageColors: [
    "var(--color-message-1-transparent, rgba(255, 0, 0, 0.75))",
    "var(--color-message-2-transparent, rgba(0, 255, 0, 0.75))",
    "var(--color-message-3-transparent, rgba(0, 0, 255, 0.75))",
    "var(--color-message-4-transparent, rgba(255, 255, 0, 0.75))",
    "var(--color-message-5-transparent, rgba(0, 255, 255, 0.75))",
    "var(--color-message-6-transparent, rgba(255, 0, 255, 0.75))",
    "var(--color-message-7-transparent, rgba(255, 128, 0, 0.75))",
    "var(--color-message-8-transparent, rgba(128, 0, 255, 0.75))",
  ],
  colorClasses: [
    "message-1",
    "message-2",
    "message-3",
    "message-4",
    "message-5",
    "message-6",
    "message-7",
    "message-8",
  ],
  updateFrequency: 30, // ms - throttle updates for better performance
};

/**
 * Convert quaternion to Euler angles (roll, pitch, yaw)
 * @param {Object} quaternion - Object with x, y, z, w properties
 * @returns {Object} Object with roll, pitch, yaw in degrees
 */
function quaternionToEuler(quaternion: Quaternion): { roll: number; pitch: number; yaw: number } {
  // Check for null values
  if (!quaternion || typeof quaternion.w !== "number") {
    console.warn("Invalid quaternion:", quaternion);
    return { roll: 0, pitch: 0, yaw: 0 };
  }

  const q0 = quaternion.w;
  const q1 = quaternion.x;
  const q2 = quaternion.y;
  const q3 = quaternion.z;

  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (q0 * q1 + q2 * q3);
  const cosr_cosp = 1 - 2 * (q1 * q1 + q2 * q2);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation)
  const sinp = 2 * (q0 * q2 - q3 * q1);
  let pitch;
  if (Math.abs(sinp) >= 1) {
    pitch = Math.sign(sinp) * Math.PI / 2; // Use 90 degrees if out of range
  } else {
    pitch = Math.asin(sinp);
  }

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (q0 * q3 + q1 * q2);
  const cosy_cosp = 1 - 2 * (q2 * q2 + q3 * q3);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  // Convert to degrees
  return {
    roll: roll * (180 / Math.PI),
    pitch: pitch * (180 / Math.PI),
    yaw: yaw * (180 / Math.PI),
  };
}

/**
 * Extract orientation from different message types
 * @param {Object} message - ROS message object
 * @returns {Object|null} Quaternion object or null if not found
 */
function extractQuaternion(message: unknown): Quaternion | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const msg = message as any;

  // Direct quaternion
  if (msg.x !== undefined && msg.y !== undefined && msg.z !== undefined && msg.w !== undefined) {
    return msg;
  }

  // IMU message
  if (msg.orientation) {
    return msg.orientation;
  }

  // Pose message
  if (msg.pose?.orientation) {
    return msg.pose.orientation;
  }

  // Pose with covariance (like in Odometry)
  if (msg.pose?.pose?.orientation) {
    return msg.pose.pose.orientation;
  }

  // Transform message
  if (msg.rotation) {
    return msg.rotation;
  }

  // TransformStamped message
  if (msg.transform?.rotation) {
    return msg.transform.rotation;
  }

  return undefined;
}

/**
 * CSS for the Orientation Panel 2D
 */
const panelStyles = `
:root {
  --color-accent-primary: #4CAF50;
  --color-border-primary: #555;
  --color-indicator-bg: #000;
  
  /* Message colors */
  --color-message-1: #FF0000;
  --color-message-2: #00FF00;
  --color-message-3: #0000FF;
  --color-message-4: #FFFF00;
  --color-message-5: #00FFFF;
  --color-message-6: #FF00FF;
  --color-message-7: #FF8000;
  --color-message-8: #8000FF;
  
  /* Message colors with transparency */
  --color-message-1-transparent: rgba(255, 0, 0, 0.75);
  --color-message-2-transparent: rgba(0, 255, 0, 0.75);
  --color-message-3-transparent: rgba(0, 0, 255, 0.75);
  --color-message-4-transparent: rgba(255, 255, 0, 0.75);
  --color-message-5-transparent: rgba(0, 255, 255, 0.75);
  --color-message-6-transparent: rgba(255, 0, 255, 0.75);
  --color-message-7-transparent: rgba(255, 128, 0, 0.75);
  --color-message-8-transparent: rgba(128, 0, 255, 0.75);
}

.orientation-panel-2d {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.displays-container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 16px;
  min-height: fit-content;
  max-height: 40%;
}

.orientation-display {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.display-title {
  font-weight: bold;
  margin-bottom: 8px;
}

.display-element {
  position: relative;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  border: 3px solid white;
  background-color: var(--color-indicator-bg, #000);
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.compass-face {
  position: relative;
  width: 100%;
  height: 100%;
}

.compass-face::after {
  content: 'N';
  position: absolute;
  top: 5%;
  left: 50%;
  transform: translateX(-50%);
  color: white;
  font-weight: bold;
}

.no-data-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #aaa;
  font-style: italic;
}

.topic-indicator {
  position: absolute;
  width: 100%;
  height: 3px;
  top: 50%;
  left: 0;
  transform-origin: center;
  z-index: 10;
  pointer-events: none;
  transition: transform 0.3s;
}

.yaw-indicator {
  position: absolute;
  width: 50%;
  height: 3px;
  top: 50%;
  left: 50%;
  transform-origin: left center;
  z-index: 10;
  pointer-events: none;
  transition: transform 0.3s;
}

/* Topic values display */
.topic-values-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-top: 16px;
}

.topic-values {
  padding: 8px;
  font-family: monospace;
  overflow-y: auto;
  flex: 1;
  min-height: 0; /* Important for flex containers to allow shrinking below content size */
  display: flex;
  flex-direction: column;
}

.topic-value-item {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 4px;
  background-color: rgba(0, 0, 0, 0.2);
  overflow: hidden;
  flex-shrink: 0;
}

.message-1 { border-left: 4px solid var(--color-message-1); }
.message-2 { border-left: 4px solid var(--color-message-2); }
.message-3 { border-left: 4px solid var(--color-message-3); }
.message-4 { border-left: 4px solid var(--color-message-4); }
.message-5 { border-left: 4px solid var(--color-message-5); }
.message-6 { border-left: 4px solid var(--color-message-6); }
.message-7 { border-left: 4px solid var(--color-message-7); }
.message-8 { border-left: 4px solid var(--color-message-8); }

.topic-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.topic-color-indicator {
  width: 12px;
  height: 12px;
  display: inline-block;
  margin-right: 4px;
  border-radius: 50%;
}

.topic-color-indicator.message-1 { background-color: var(--color-message-1); }
.topic-color-indicator.message-2 { background-color: var(--color-message-2); }
.topic-color-indicator.message-3 { background-color: var(--color-message-3); }
.topic-color-indicator.message-4 { background-color: var(--color-message-4); }
.topic-color-indicator.message-5 { background-color: var(--color-message-5); }
.topic-color-indicator.message-6 { background-color: var(--color-message-6); }
.topic-color-indicator.message-7 { background-color: var(--color-message-7); }
.topic-color-indicator.message-8 { background-color: var(--color-message-8); }

.topic-name {
  font-weight: bold;
  margin-right: 8px;
  word-break: break-all;
}

.orientation-values {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.orientation-value {
  min-width: 80px;
}

.value-label {
  color: #aaa;
}

.value {
  font-weight: bold;
}

@media (max-width: 768px) {
  .display-element {
    width: 150px;
    height: 150px;
  }
}
`;

interface Orientation {
  roll: number;
  pitch: number;
  yaw: number;
}

function OrientationPanel2D({ context }: { context: PanelExtensionContext }): ReactElement {
  const [orientations, setOrientations] = useState<Map<string, Orientation>>(new Map());
  const [topics, setTopics] = useState<readonly Topic[] | undefined>();
  const [messages, setMessages] = useState<Map<string, FoxgloveMessageEvent<unknown>>>(new Map());
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();
  const containerRef = useRef<HTMLDivElement>(null);
  const rollDisplayRef = useRef<HTMLDivElement>(null);
  const pitchDisplayRef = useRef<HTMLDivElement>(null);
  const yawDisplayRef = useRef<HTMLDivElement>(null);
  const updatePendingRef = useRef(false);
  const lastUpdateTimeRef = useRef(0);

  const [state, setState] = useState<PanelState>(() => {
    const savedState = context.initialState as Partial<PanelState>;
    return {
      ...getInitialState(),
      ...savedState,
      topics: {
        ...getInitialState().topics,
        ...(savedState?.topics ?? {}),
      },
    };
  });

  /**
   * Helper function to handle topic enabled/visibility changes
   * This handles both the visibility toggle (eye icon) and the enabled checkbox
   * It updates subscriptions and cleans up messages/orientations when a topic is disabled
   */
  const handleTopicEnabledChange = useCallback((topicName: string, enabled: boolean) => {
    setState((prevState) => {
      const newState = updateTopicStatus(prevState, topicName, enabled);

      // Update subscriptions
      const enabledTopics = getEnabledTopics(newState);
      context.subscribe(enabledTopics.map((topic) => ({ topic })));

      // If we're disabling a topic, remove it from messages to clear it from display
      if (!enabled && messages.has(topicName)) {
        const newMessages = new Map(messages);
        newMessages.delete(topicName);
        setMessages(newMessages);
        
        // Also remove from orientations
        setOrientations(prev => {
          const newOrientations = new Map(prev);
          newOrientations.delete(topicName);
          return newOrientations;
        });
      }

      return newState;
    });
  }, [context, messages]);

  // Filter topics that might contain orientation data
  const orientationTopics = useMemo(
    () =>
      (topics ?? []).filter(
        (topic) =>
          ORIENTATION_TYPES.includes(topic.schemaName),
      ),
    [topics],
  );

  // Handle settings tree actions - processes user interactions with the settings panel
  const actionHandler = useCallback(
    (action: SettingsTreeAction) => {
      if (action.action === "update") {
        const { path, value } = action.payload;

        if (path[0] === "general") {
          if (path[1] === "rollEnabled" && typeof value === "boolean") {
            setState((prevState) => updateDisplaySetting(prevState, "rollEnabled", value));
          } else if (path[1] === "pitchEnabled" && typeof value === "boolean") {
            setState((prevState) => updateDisplaySetting(prevState, "pitchEnabled", value));
          } else if (path[1] === "yawEnabled" && typeof value === "boolean") {
            setState((prevState) => updateDisplaySetting(prevState, "yawEnabled", value));
          }
        } else if (path[0] === "topics" && typeof path[1] === "string") {
          const topicName = path[1];
          
          // Handle visibility toggle or enabled checkbox
          if (typeof value === "boolean" && (path.length === 2 || path[2] === "visible" || 
              (path.length === 3 && path[2] === "enabled"))) {
            handleTopicEnabledChange(topicName, value);
          } else if (path[2] === "topicSettings" && path.length === 4 && typeof value === "boolean") {
            // Handle individual component toggles (roll, pitch, yaw)
            // These should only affect the specific component without changing the topic's enabled state
            if (path[3] === "showRoll") {
              setState((prevState) => updateTopicComponentStatus(prevState, topicName, "showRoll", value));
            } else if (path[3] === "showPitch") {
              setState((prevState) => updateTopicComponentStatus(prevState, topicName, "showPitch", value));
            } else if (path[3] === "showYaw") {
              setState((prevState) => updateTopicComponentStatus(prevState, topicName, "showYaw", value));
            }
          }
        }
      }
    },
    [context, messages, handleTopicEnabledChange],
  );

  // Update settings tree
  useEffect(() => {
    context.saveState(state);
    const tree = buildSettingsTree(state, orientationTopics);

    context.updatePanelSettingsEditor({
      actionHandler,
      nodes: tree,
    });
  }, [context, actionHandler, state, orientationTopics]);

  // Initialize subscriptions on mount
  useEffect(() => {
    const enabledTopics = getEnabledTopics(state);
    if (enabledTopics.length > 0) {
      context.subscribe(enabledTopics.map((topic) => ({ topic })));
    }

    return () => {
      context.subscribe([]); // Clear subscriptions on unmount
    };
  }, [context, state]);

  // Handle window resize
  const handleResize = useCallback(() => {
    // The panel automatically resizes with the container
  }, []);

  // Setup resize observer
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  // Process incoming messages and update orientations
  useEffect(() => {
    messages.forEach((message, topic) => {
      const quaternion = extractQuaternion(message.message);
      if (!quaternion) return;

      const euler = quaternionToEuler(quaternion);
      setOrientations((prev) => new Map(prev).set(topic, euler));
    });
  }, [messages]);

  // Render function for Foxglove
  useLayoutEffect(() => {
    context.onRender = (
      renderState: {
        currentFrame?: readonly FoxgloveMessageEvent<unknown>[];
        topics?: readonly Topic[];
      },
      done,
    ) => {
      setRenderDone(() => done);
      setTopics(renderState.topics);

      if (renderState.currentFrame?.length) {
        const newMessages = new Map(messages);
        renderState.currentFrame.forEach((msg) => {
          if (state.topics[msg.topic]?.enabled) {
            newMessages.set(msg.topic, msg);
          }
        });
        setMessages(newMessages);
      }
    };

    context.watch("topics");
    context.watch("currentFrame");
  }, [context, messages, state.topics]);

  // Notify rendering is done
  useEffect(() => {
    renderDone?.();
  }, [renderDone]);

  // Update orientation displays
  useEffect(() => {
    // Only proceed if relevant displays are enabled
    const rollEnabled = state.displaySettings.rollEnabled && rollDisplayRef.current;
    const pitchEnabled = state.displaySettings.pitchEnabled && pitchDisplayRef.current;
    const yawEnabled = state.displaySettings.yawEnabled && yawDisplayRef.current;
    
    if (!rollEnabled && !pitchEnabled && !yawEnabled) return;

    // Clear existing indicators
    if (rollEnabled) {
      const rollDisplay = rollDisplayRef.current;
      rollDisplay.querySelectorAll(".topic-indicator").forEach((el) => el.remove());
    }
    
    if (pitchEnabled) {
      const pitchDisplay = pitchDisplayRef.current;
      pitchDisplay.querySelectorAll(".topic-indicator").forEach((el) => el.remove());
    }
    
    if (yawEnabled) {
      const yawDisplay = yawDisplayRef.current;
      const compassFace = yawDisplay.querySelector(".compass-face");
      if (compassFace) {
        compassFace.querySelectorAll(".yaw-indicator").forEach((el) => el.remove());
      }
    }

    // Add indicators for each topic
    let topicIndex = 0;
    orientations.forEach((orientation, topicName) => {
      if (topicIndex >= MAX_TOPICS) return;

      const topicConfig = state.topics[topicName];
      if (!topicConfig || !topicConfig.enabled) return;

      const colorValue = CONFIG.messageColors[topicIndex];
      const colorClass = CONFIG.colorClasses[topicIndex];

      // Create roll indicator if visible
      if (rollEnabled && topicConfig.showRoll) {
        const indicator = document.createElement("div");
        indicator.className = `topic-indicator ${colorClass}`;
        indicator.style.backgroundColor = colorValue;
        indicator.style.transform = `rotate(${orientation.roll}deg)`;
        rollDisplayRef.current.appendChild(indicator);
      }

      // Create pitch indicator if visible
      if (pitchEnabled && topicConfig.showPitch) {
        const indicator = document.createElement("div");
        indicator.className = `topic-indicator ${colorClass}`;
        indicator.style.backgroundColor = colorValue;
        indicator.style.transform = `rotate(${orientation.pitch}deg)`;
        pitchDisplayRef.current.appendChild(indicator);
      }

      // Create yaw indicator if visible
      if (yawEnabled && topicConfig.showYaw) {
        const yawDisplay = yawDisplayRef.current;
        const compassFace = yawDisplay.querySelector(".compass-face");
        if (compassFace) {
          const indicator = document.createElement("div");
          indicator.className = `yaw-indicator ${colorClass}`;
          indicator.style.backgroundColor = colorValue;
          indicator.style.transform = `rotate(${orientation.yaw}deg)`;
          compassFace.appendChild(indicator);
        }
      }

      topicIndex++;
    });
  }, [orientations, state.topics, state.displaySettings]);

  // Initialize styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = panelStyles;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Render the panel
  return (
    <div className="orientation-panel-2d" ref={containerRef}>
      <div className="displays-container">
        {state.displaySettings.rollEnabled && (
          <div className="orientation-display">
            <div className="display-title">Roll</div>
            <div className="display-element" ref={rollDisplayRef}>
              {orientations.size === 0 && (
                <div className="no-data-message">No orientation data</div>
              )}
            </div>
          </div>
        )}
        {state.displaySettings.pitchEnabled && (
          <div className="orientation-display">
            <div className="display-title">Pitch</div>
            <div className="display-element" ref={pitchDisplayRef}>
              {orientations.size === 0 && (
                <div className="no-data-message">No orientation data</div>
              )}
            </div>
          </div>
        )}
        {state.displaySettings.yawEnabled && (
          <div className="orientation-display">
            <div className="display-title">Yaw</div>
            <div className="display-element" ref={yawDisplayRef}>
              <div className="compass-face">
                {orientations.size === 0 && (
                  <div className="no-data-message">No orientation data</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="topic-values-container">
        <div className="topic-values">
          {Array.from(orientations.entries()).map(([topicName, orientation], index) => (
            <div key={topicName} className={`topic-value-item ${CONFIG.colorClasses[index]}`}>
              <div className="topic-header">
                <span className={`topic-color-indicator ${CONFIG.colorClasses[index]}`}></span>
                <span className="topic-name">{topicName}</span>
              </div>
              <div className="orientation-values">
                {state.displaySettings.rollEnabled && state.topics[topicName]?.showRoll && (
                  <div className="orientation-value">
                    <span className="value-label">roll: </span>
                    <span className="value">{orientation.roll.toFixed(1)}°</span>
                  </div>
                )}
                {state.displaySettings.pitchEnabled && state.topics[topicName]?.showPitch && (
                  <div className="orientation-value">
                    <span className="value-label">pitch: </span>
                    <span className="value">{orientation.pitch.toFixed(1)}°</span>
                  </div>
                )}
                {state.displaySettings.yawEnabled && state.topics[topicName]?.showYaw && (
                  <div className="orientation-value">
                    <span className="value-label">yaw: </span>
                    <span className="value">{orientation.yaw.toFixed(1)}°</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {orientations.size === 0 && (
            <div className="topic-value-item">
              <div className="topic-header">
                <span className="topic-name">No active topics</span>
              </div>
              <div className="orientation-values">
                <div>Select orientation topics in the panel settings</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function initOrientationPanel2D(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<OrientationPanel2D context={context} />);
  return () => {
    root.unmount();
  };
}
