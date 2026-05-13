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
- [x] the maxf value of each subcomponent should be changeable to another value as long as with this new maxf value, it does not hurt the overall
    maxf value of the fault tree
- [x] instant feedback whether the current configuration is legal through giving the output a red or green border, instead of only showing the
    popup on close (keep the popup)
- [x] after the user has edited the automatically generate strict failure model fault tree, any newly auto generated fault tree, will be created
    under a new output node (the user edit stays on one output node and a second one is created for the automatically generated stuff)
