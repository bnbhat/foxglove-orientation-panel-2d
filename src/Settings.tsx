import { SettingsTreeNodes, Topic } from "@foxglove/extension";
import { transform } from "lodash";

/**
 * Panel state definition
 * Contains all the configuration for the orientation panel
 */
export type PanelState = {
  /** Configuration for each topic */
  topics: {
    [topicName: string]: {
      /** Whether the topic is enabled/visible */
      enabled: boolean;
      /** Whether to show roll for this topic */
      showRoll: boolean;
      /** Whether to show pitch for this topic */
      showPitch: boolean;
      /** Whether to show yaw for this topic */
      showYaw: boolean;
    };
  };
  /** Global display settings */
  displaySettings: {
    /** Whether to show the roll display */
    rollEnabled: boolean;
    /** Whether to show the pitch display */
    pitchEnabled: boolean;
    /** Whether to show the yaw display */
    yawEnabled: boolean;
  };
};

/**
 * Creates the initial state for the panel
 * Used when the panel is first loaded or reset
 *
 * @returns Default panel state
 */
export function getInitialState(): PanelState {
  return {
    topics: {},
    displaySettings: {
      rollEnabled: true,
      pitchEnabled: true,
      yawEnabled: true
    }
  };
}

/**
 * Updates a topic's enabled status
 * This is used when toggling a topic on/off via the visibility icon or enabled checkbox
 *
 * @param state Current panel state
 * @param topicName Name of the topic to update
 * @param enabled New enabled state
 * @returns Updated panel state
 */
export function updateTopicStatus(
  state: PanelState,
  topicName: string,
  enabled: boolean,
): PanelState {
  const existingTopic = state.topics[topicName];
  return {
    ...state,
    topics: {
      ...state.topics,
      [topicName]: {
        enabled,
        showRoll: existingTopic?.showRoll ?? true,
        showPitch: existingTopic?.showPitch ?? true,
        showYaw: existingTopic?.showYaw ?? true,
      },
    },
  };
}

/**
 * Updates a display setting (roll, pitch, yaw visibility)
 * This controls whether each orientation component is shown in the panel
 *
 * @param state Current panel state
 * @param component Which component to update
 * @param enabled New enabled state
 * @returns Updated panel state
 */
export function updateDisplaySetting(
  state: PanelState,
  component: "rollEnabled" | "pitchEnabled" | "yawEnabled",
  enabled: boolean,
): PanelState {
  return {
    ...state,
    displaySettings: {
      ...state.displaySettings,
      [component]: enabled,
    },
  };
}

/**
 * Updates a specific component setting for a topic
 * This controls whether roll, pitch, or yaw is shown for a specific topic
 *
 * @param state Current panel state
 * @param topicName Name of the topic to update
 * @param component Which component to update
 * @param enabled New enabled state
 * @returns Updated panel state
 */
export function updateTopicComponentStatus(
  state: PanelState,
  topicName: string,
  component: "showRoll" | "showPitch" | "showYaw",
  enabled: boolean,
): PanelState {
  if (!state.topics[topicName]) {
    return state;
  }
  
  return {
    ...state,
    topics: {
      ...state.topics,
      [topicName]: {
        ...state.topics[topicName],
        [component]: enabled,
      },
    },
  };
}

/**
 * Gets a list of all enabled topic names
 * Used to update subscriptions when topics are enabled/disabled
 *
 * @param state Current panel state
 * @returns Array of enabled topic names
 */
export function getEnabledTopics(state: PanelState): string[] {
  return Object.entries(state.topics)
    .filter(([_, config]) => config.enabled)
    .map(([topicName]) => topicName);
}

/**
 * Builds the settings tree for the panel
 * This creates the structure that appears in the settings panel
 *
 * @param state Current panel state
 * @param orientationTopics List of available orientation topics
 * @returns Settings tree nodes structure
 */
export function buildSettingsTree(
  state: PanelState,
  orientationTopics: readonly Topic[],
): SettingsTreeNodes {
  // Transform topics into settings tree nodes
  const topics: SettingsTreeNodes = transform(
    orientationTopics,
    (result, topic) => {
      const isEnabled = state.topics[topic.name]?.enabled ?? false;
      
      result[topic.name] = {
        label: topic.name,
        defaultExpansionState: "collapsed",
        visible: isEnabled,
        children: isEnabled
          ? {
              topicSettings: {
                label: "Topic Settings",
                fields: {
                  showRoll: {
                    label: "Show Roll",
                    input: "boolean",
                    value: state.topics[topic.name]?.showRoll ?? true,
                  },
                  showPitch: {
                    label: "Show Pitch",
                    input: "boolean",
                    value: state.topics[topic.name]?.showPitch ?? true,
                  },
                  showYaw: {
                    label: "Show Yaw",
                    input: "boolean",
                    value: state.topics[topic.name]?.showYaw ?? true,
                  },
                },
              },
            }
          : undefined,
      };
    },
    {} as SettingsTreeNodes,
  );

  return {
    general: {
      label: "Display Elements",
      fields: {
        rollEnabled: {
          label: "Roll Display",
          input: "boolean",
          value: state.displaySettings.rollEnabled,
        },
        pitchEnabled: {
          label: "Pitch Display",
          input: "boolean",
          value: state.displaySettings.pitchEnabled,
        },
        yawEnabled: {
          label: "Yaw Display",
          input: "boolean",
          value: state.displaySettings.yawEnabled,
        },
      },
    },
    topics: {
      label: "Topics",
      children: topics,
    },
  };
}
