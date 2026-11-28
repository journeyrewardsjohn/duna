Pod::Spec.new do |s|
  s.name           = 'DunaCapture'
  s.version        = '1.0.0'
  s.summary        = 'Duna recording-first camera engine.'
  s.description    = 'Records a clean, crash-safe camera original with AVFoundation. No third-party code: frame taps let optional features (Watch preview, live broadcast) watch the camera without being able to interrupt the recording.'
  s.author         = 'Duna'
  s.homepage       = 'https://duna.coach'
  s.platforms      = {
    :ios => '26.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreMedia', 'CoreMotion', 'CoreVideo', 'UIKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.10'
  }

  # Engine/ has no React Native or Expo imports and is also built and tested
  # on its own through Package.swift. Tests/ and Package.swift stay out of
  # the app.
  s.source_files = 'Expo/**/*.swift', 'Engine/**/*.swift'
end
