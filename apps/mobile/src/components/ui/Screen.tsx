import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useResponsive } from '@/theme/useResponsive';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  safeTop?: boolean;
  style?: ViewStyle;
};

export function Screen({ children, scroll, padded = true, safeTop = false, style }: Props) {
  const { screenStyle } = useTheme();
  const { horizontalPadding, contentMaxWidth } = useResponsive();

  const content = (
    <View
      style={[
        screenStyle,
        {
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
          paddingHorizontal: padded ? horizontalPadding : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={screenStyle} edges={safeTop ? ['top'] : []}>
      <KeyboardAvoidingView
        style={screenStyle}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}>
        {scroll ? (
          <ScrollView
            style={screenStyle}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
