import { forwardRef, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type TextInput,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CountryPicker, {
  type Country,
  type CountryCode,
} from 'react-native-country-picker-modal';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, radii } from '@/theme/tokens';
import {
  countryCodeToFlagEmoji,
  DEFAULT_COUNTRY_CODE,
} from '@/components/integrations/countryCodes';

export type CountryPhoneFieldProps = {
  countryCode: CountryCode;
  callingCode: string;
  phone: string;
  onCountryChange: (countryCode: CountryCode, callingCode: string) => void;
  onPhoneChange: (phone: string) => void;
  placeholder?: string;
} & Pick<TextInputProps, 'autoFocus' | 'onFocus'>;

const { height: WINDOW_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = Math.min(WINDOW_HEIGHT * 0.72, 560);

export const CountryPhoneField = forwardRef<TextInput, CountryPhoneFieldProps>(function CountryPhoneField(
  {
    countryCode,
    callingCode,
    phone,
    onCountryChange,
    onPhoneChange,
    placeholder = 'Mobile number',
    autoFocus = false,
    onFocus,
  },
  ref
) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = useState(false);
  const dialCode = callingCode.replace(/\D/g, '');

  const closePicker = () => setPickerVisible(false);
  const openPicker = () => setPickerVisible(true);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel={`Country code plus ${dialCode}`}
          style={({ pressed }) => [
            styles.countryBtn,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.88 : 1,
            },
          ]}>
          <Text style={styles.flagEmoji} allowFontScaling={false}>
            {countryCodeToFlagEmoji(countryCode)}
          </Text>
          <Text variant="body">+{dialCode}</Text>
        </Pressable>
        <View style={styles.phoneInput}>
          <Input
            ref={ref}
            value={phone}
            onChangeText={onPhoneChange}
            placeholder={placeholder}
            keyboardType="phone-pad"
            autoComplete="tel"
            autoFocus={autoFocus}
            returnKeyType="done"
            onFocus={onFocus}
          />
        </View>
      </View>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
        statusBarTranslucent>
        <View style={styles.overlay}>
          <Pressable
            style={[styles.backdrop, { backgroundColor: colors.overlay }]}
            onPress={closePicker}
            accessibilityRole="button"
            accessibilityLabel="Close country picker"
          />
          <View
            style={[
              styles.modalSheet,
              {
                height: SHEET_HEIGHT + insets.bottom,
                paddingBottom: insets.bottom,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.pickerFill}>
              {pickerVisible ? (
                <CountryPicker
                withModal={false}
                withFlagButton={false}
                renderFlagButton={() => null}
                withFilter
                withFlag
                withCallingCode
                withEmoji
                withCloseButton
                countryCode={countryCode}
                preferredCountries={[DEFAULT_COUNTRY_CODE]}
                onSelect={(country: Country) => {
                  const dial = country.callingCode[0] ?? '';
                  onCountryChange(country.cca2, dial);
                  closePicker();
                }}
                onClose={closePicker}
                theme={{
                  backgroundColor: colors.surface,
                  onBackgroundTextColor: colors.text,
                  primaryColor: colors.border,
                  primaryColorVariant: colors.background,
                  filterPlaceholderTextColor: colors.textMuted,
                  fontSize: 16,
                  flagSize: 24,
                }}
                filterProps={{
                  placeholder: 'Search country',
                  autoCorrect: false,
                }}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

CountryPhoneField.displayName = 'CountryPhoneField';

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    minWidth: 98,
  },
  flagEmoji: {
    fontSize: 18,
    lineHeight: 22,
    width: 22,
    textAlign: 'center',
  },
  phoneInput: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  modalSheet: {
    width: '100%',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pickerFill: {
    flex: 1,
    minHeight: 0,
  },
});
