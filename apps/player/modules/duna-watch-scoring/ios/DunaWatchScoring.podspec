Pod::Spec.new do |s|
  s.name           = 'DunaWatchScoring'
  s.version        = '1.0.0'
  s.summary        = 'Secure Apple Watch score-draft handoff for Duna.'
  s.description    = 'Connects the Duna watchOS scorer to the signed-in Duna iPhone app.'
  s.author         = 'Duna'
  s.homepage       = 'https://duna.coach'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WatchConnectivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
