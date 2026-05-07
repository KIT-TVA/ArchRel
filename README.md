# ArchRel

## TODO
- [x] Only the "root" of a interface change should be shown in the system CFT
- [x] the provider of an interface create failure in its parent (the component that depends on it) - and needs to be added to its CFT - not the systems
- [x] remove XOR, NOT Gates
- [x] currently subcomponents do not show their maxf value correctly
- [x] interface rule maxf refinement could be broken? (they get assigned the same value
- [x] repeatetly pressing "add component" should be the same as adding many subcomponents to the system 
- [x] The maxf value of the system should be propagated downwards (each component recieves a maxf value)
- [x] during each refinement step the cft of the touched components should be evaluated to a probability and checked if that probability
is higher than maxf - if so the refinement fails and an error is shown
- [x] double click on subcomponent opens its CFT
