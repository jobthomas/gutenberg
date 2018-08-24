/**
 * WordPress dependencies
 */
import { __, sprintf } from '@wordpress/i18n';
import { Modal } from '@wordpress/components';
import { Component, Fragment } from '@wordpress/element';
import { withSelect } from '@wordpress/data';
import {
	PostPreviewButton,
} from '@wordpress/editor';
import './style.scss';
import { addQueryArgs } from '@wordpress/url';
import { getPostEditURL } from '../../../../edit-post/components/browser-url';
import { getWPAdminURL } from '../../../editor/src/utils/url';

class PostLockedModal extends Component {
	constructor() {
		super( ...arguments );
		this.state = {
			isOpen: true,
		};
		this.takeOverPost = this.takeOverPost.bind( this );
		const { lockDetails, user } = this.props;

		if ( lockDetails && lockDetails.text ) {
			this.modalText = lockDetails.text;
			this.avatar = lockDetails.avatar_src;
			this.takeover = true;
		} else {
			const displayName = ( user && user.data ) ? user.data.display_name : __( 'Another user' );
			this.modalText = sprintf( __( '%s is already editing this post. Do you want to take over?' ), displayName );
			this.avatar = user.data.avatar_src;
		}
	}

	takeOverPost() {
		const { lockNonce, id } = this.props;
		const unlockUrl = addQueryArgs( getPostEditURL(), {
			'get-post-lock': '1',
			_wpnonce: lockNonce,
			lockKey: true,
			post: id,
		} );
		document.location = unlockUrl;
	}

	allPosts() {
		document.location = getWPAdminURL( 'edit.php' );
	}

	render() {
		return (
			<Fragment>
				{
					this.state.isOpen ?
						<Modal
							title={ this.takeover ? __( 'Post taken over' ) : __( 'Post locked' ) }
							onRequestClose={ this.closeModal }
							focusOnMount={ true }
							shouldCloseOnClickOutside={ false }
							shouldCloseOnEsc={ false }
							isDismissable={ false }
							className="post-locked-modal"
						>
							{
								this.avatar &&
									<img
										src={ this.avatar }
										alt={ __( 'Avatar' ) }
										className="components-modal__image"
									/>
							}
							<span>
								<div>
									{ this.modalText }
								</div>
								{
									this.takeover ?
										<p><a
											href={ getWPAdminURL( 'edit.php' ) }
										>
											{ __( 'View all posts' ) }
										</a></p> :
										<button
											className={ 'button' }
											onClick={ this.allPosts }
										>
											{ __( 'All Posts' ) }
										</button>
								}
								{ ! this.takeover &&
									<span>
										<PostPreviewButton />
										<button
											className="button button-primary"
											onClick={ this.takeOverPost }
										>
											{ __( 'Take Over' ) }
										</button>
									</span>
								}
							</span>
						</Modal> :
						null
				}
			</Fragment>
		);
	}
}

export default withSelect( ( select ) => {
	return {
		lockDetails: select( 'core/editor' ).getLockDetails(),
		user: select( 'core/editor' ).getPostLockUser(),
		id: select( 'core/editor' ).getCurrentPost().id,
		lockNonce: select( 'core/editor' ).getEditorSettings().lockNonce,
	};
} )( PostLockedModal );