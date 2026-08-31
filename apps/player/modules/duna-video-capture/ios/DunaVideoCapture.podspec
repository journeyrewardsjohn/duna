Pod::Spec.new do |s|
  s.name           = 'DunaVideoCapture'
  s.version        = '1.0.0'
  s.summary        = 'Duna iOS court guidance, recording, program mixing, and SRT/RTMPS publishing.'
  s.description    = 'Combines ARKit, AVFoundation, Vision, Core Motion, and HaishinKit for Duna video capture.'
  s.author         = 'Duna'
  s.homepage       = 'https://duna.coach'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # SRTHaishinKit 1.9.9 pins its compatible HaishinKit core to 1.9.8.
  s.dependency 'HaishinKit', '1.9.8'
  s.dependency 'SRTHaishinKit', '1.9.9'
  s.frameworks = 'ARKit', 'AVFoundation', 'CoreMotion', 'PhotosUI', 'SceneKit', 'Vision'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.10'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
