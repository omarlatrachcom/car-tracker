import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { styles } from "../styles";

type OptionButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

export function OptionButton({ label, selected, onPress }: OptionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionButton, selected && styles.optionButtonSelected]}
    >
      <Text
        style={[
          styles.optionButtonText,
          selected && styles.optionButtonTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type LocationInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  onUseCurrentLocation: () => void;
  isResolving: boolean;
  disabled: boolean;
};

export function LocationInput({
  value,
  onChangeText,
  onUseCurrentLocation,
  isResolving,
  disabled,
}: LocationInputProps) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.label}>Location</Text>
      <View style={styles.locationRow}>
        <TextInput
          style={[styles.input, styles.locationTextInput]}
          placeholder="Example: Casablanca"
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          autoCapitalize="words"
          returnKeyType="done"
        />
        <Pressable
          style={[
            styles.secondaryButton,
            styles.locationButton,
            disabled && styles.buttonDisabled,
          ]}
          onPress={onUseCurrentLocation}
          disabled={disabled}
        >
          {isResolving ? (
            <ActivityIndicator size="small" color="#111" />
          ) : (
            <Text style={styles.locationButtonText}>Use GPS</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
