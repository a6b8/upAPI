import { ERC725 } from '@erc725/erc725.js';
import fs from 'fs'

const lsp3ProfileSchema = JSON.parse( 
    fs.readFileSync( './node_modules/@erc725/erc725.js/schemas/LSP3ProfileMetadata.json' ) 
) 
import { printMessages, keyPathToValue, objectToKeyPaths } from './../helpers/mixed.mjs'
import { ValueModifier } from './../helpers/ValueModifier.mjs'



export class LSPInteraction {
    #state
    #config

    constructor( config, validation=false ) {
        this.#config = config

        return true
    }


    init( { validation=true } ) {
        this.#state = {
            'validation': validation
        }
        return this
    }


    async getData( { address, network, presetKey } ) {
        if( this.#state['validation'] ) {
            const [ m, c ] = this.validateGetData( { address, network,  presetKey } )
            printMessages( { 'messages': m, 'comments': c } )
        }

        const response = await this.#getLspData( { address, network } )
        const data = {
            'data': this.#usePreset( { response, presetKey } ),
            'status': response['status']
        }

        return data
    }


    #usePreset( { response, presetKey } ) {
        if( presetKey === undefined ) {
            return response
        }

        let error = false
        const flatten = response['data']
            .filter( a => a['name'] === this.#config['presets'][ presetKey ]['filter'] )
            .map( a  => {
                const data = a['value']
                const result = objectToKeyPaths( { data } )
                    .reduce( ( acc, keyPath, index ) => {
                        const searchs = this.#config['presets'][ presetKey ]['flatten']
                            .map( b => b[ 0 ] )

                        const flatIndex = searchs
                            .findIndex( b => b === keyPath )

                        const value = keyPathToValue( { data, keyPath } )
                        if( flatIndex === -1 ) {
                            !acc.hasOwnProperty( '_additional' ) ? acc['_additional'] = {} : ''
                            acc['_additional'][ keyPath ] = value
                        } else {
                            const flat = this.#config['presets'][ presetKey ]['flatten'][ flatIndex ]
                            acc[ flat[ 1 ] ] = value
                        }
                        return acc
                    }, {} )

                return result
            } )
        if( error ) { console.log( 'Error: Flattening raised errors.' ) }

        const mod = new ValueModifier( this.#config )
        const modifiedTxt = JSON
            .stringify( flatten )
            .replace(
                /ipfs:\/\/[a-zA-Z0-9]{46}/ig,
                ( match ) => {
                    return mod.start( {
                        'value': match,
                        'modifier': this.#config['presets'][ presetKey ]['modifier']
                    } )['value']
                }
            )
        const modified = JSON.parse( modifiedTxt )
        return modified
    }


    #findModSelectors( { value } ) {
        const test = value
            .match( /{{([^{}]+)}}/ )
    
        if( test === null ) {
            console.log( 'null' )
            return []
        } 
    
        const r = value
            .match( /{{([^{}]+)}}/ )
            .reduce( ( acc, a, index ) => {
                const path = a
                    .replac( '{{', '' )
                    .replace( '}}', '' )
    
                const result = {
                    'from': null,
                    'to': null
                }
    
                if( a.startsWith( 'tree__' ) ) {
                    const keyPath = path
                        .replace( 'tree__', '' )
                    result['to'] = keyPathToValue( { 
                        'data': this.#config, 
                        keyPath 
                    } )
                } else if( a.startsWith( 'self' ) ) {
                    result['to'] = value
                } else {
                    console.log( `An error occured. ${a} unknown.` )
                }
    
                return acc
            }, [] )
    
        return r
    }


    #modifyValue( { value, presetKey } ) {
        value = `${value}`
        this.#config['presets'][ presetKey ]['mods']
            .forEach( mod => {
                const cmd = mod[ 0 ]
                switch( cmd ) {
                    case 'pattern':
                        const selectors = this.#findModSelectors( { 
                            'value': a[ 1 ]
                        } )

                        console.log( 'SEl', selectors )

                        break
                    case 'replace':
                        break
                    default:
                        console.log( `'mod' with key 'cmd' not found.` )
                        break
                }

            } )

        return value
    }



    async #getLspData( { address, network } ) {
        const startTime = performance.now()
        const result = {
            'data': null,
            'status': {
                'code': null,
                'message': null
            }
        }

        try {
            const profile = new ERC725(
                lsp3ProfileSchema, 
                address, 
                this.#config['networks'][ network ]['rpc'],
                { 'ipfsGateway': this.#config['ipfs']['gateways']['up'] }
            )

            const response = await profile.fetchData()
            result['data'] = response
            result['status']['code'] = 200
            result['status']['message']= `Success (${Math.floor(performance.now() - startTime)} ms)!`

        } catch( error ) {
            result['status']['code'] = 400
            result['status']['message']= `Error: This is not an ERC725 Contract. ${error}`
        }

        return result
    }


    validateGetData( { address, network, presetKey } ) {
        const messages = []
        const comments = []

        if( presetKey === undefined ) {
            comments.push( `Key 'presetKey' is not set, response is in raw format.` ) 
        } else if( typeof presetKey !== 'string' ) {
            messages.push( `Key 'presetKey' is not type of 'string'.` )
        } else if( !Object.keys( this.#config['presets'] ).includes( presetKey ) ) {
            messages.push( `Key 'presetKey', is not a valid input. Use ${Object.keys( this.#config['presets'] )} instead.` )
        }


        const tmp = [
            [ 'address', address ],
            [ 'network', network ],
        ]
            .forEach( a => {
                const [ key, value ] = a
                if( value === undefined || value === null ) {
                    messages.push( `Key '${key}' is empty.` )
                } else if( typeof value !== 'string' ) {
                    messages.push( `Key '${key}' is not type 'string'.` )
                } else {
                    switch( key ) {
                        case 'address': 
                            const test1 = address
                                .match( this.#config['validations']['ethereumAddress']['regex'] )
                            if( test1 === null ) {
                                messages.push( `Key '${key}' does not match with expected pattern. ${this.#config['validations']['ethereumAddress']['description']}` )
                                return true
                            }
                            break   
                        case 'network':
                            const allowed = Object.keys( this.#config['networks'] )
                            if( !allowed.includes( value ) ) {
                                messages.push( `Key '${key}' with the value '${value}' is not known. Use ${allowed.join( ', ' )} instead.`)
                            }

                            break
                        default:
                            messages.push( `Key '${key}' is not known.`)
                    }
                }
            } )
        return [ messages, comments ]
    } 
}